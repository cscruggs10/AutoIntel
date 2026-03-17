const EventEmitter = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const STALE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes with no progress = stale
const STALE_CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

class EnrichmentQueue extends EventEmitter {
  constructor(pool) {
    super();
    this.pool = pool;
    this.isProcessing = false;
    this.currentJob = null;
    this.workerInterval = null;
    this.currentScraperProcess = null; // Reference to child process for kill support
    this.lastProgressTime = null; // Track when we last saw progress
    this.staleCheckInterval = null; // Interval for stale job detection
  }

  // Add a runlist to the queue
  async enqueue(runlistId) {
    // Get runlist info
    const runlist = await this.pool.query(
      'SELECT * FROM runlists WHERE id = $1',
      [runlistId]
    );

    if (runlist.rows.length === 0) {
      throw new Error('Runlist not found');
    }

    // Count vehicles that need scraping
    const vehicleCount = await this.pool.query(`
      SELECT COUNT(*) as count
      FROM runlist_vehicles
      WHERE runlist_id = $1 AND matched = true AND scraped = false
    `, [runlistId]);

    const totalVehicles = parseInt(vehicleCount.rows[0].count);

    if (totalVehicles === 0) {
      throw new Error('No matched vehicles to enrich');
    }

    // Insert or update queue entry
    const result = await this.pool.query(`
      INSERT INTO enrichment_queue (runlist_id, status, total_vehicles, queued_at)
      VALUES ($1, 'queued', $2, CURRENT_TIMESTAMP)
      ON CONFLICT (runlist_id) DO UPDATE SET
        status = CASE
          WHEN enrichment_queue.status IN ('completed', 'failed', 'cancelled') THEN 'queued'
          ELSE enrichment_queue.status
        END,
        total_vehicles = $2,
        processed_vehicles = CASE
          WHEN enrichment_queue.status IN ('completed', 'failed', 'cancelled') THEN 0
          ELSE enrichment_queue.processed_vehicles
        END,
        error_count = CASE
          WHEN enrichment_queue.status IN ('completed', 'failed', 'cancelled') THEN 0
          ELSE enrichment_queue.error_count
        END,
        queued_at = CASE
          WHEN enrichment_queue.status IN ('completed', 'failed', 'cancelled') THEN CURRENT_TIMESTAMP
          ELSE enrichment_queue.queued_at
        END,
        started_at = CASE
          WHEN enrichment_queue.status IN ('completed', 'failed', 'cancelled') THEN NULL
          ELSE enrichment_queue.started_at
        END,
        completed_at = NULL,
        last_error = NULL
      RETURNING *
    `, [runlistId, totalVehicles]);

    const job = result.rows[0];

    // Emit event for new job
    this.emit('jobAdded', {
      id: job.id,
      runlistId: job.runlist_id,
      status: job.status,
      totalVehicles: job.total_vehicles,
      processedVehicles: job.processed_vehicles,
      auctionName: runlist.rows[0].auction_name
    });

    return job;
  }

  // Get status of all active queue jobs
  async getQueueStatus() {
    const result = await this.pool.query(`
      SELECT
        eq.*,
        r.auction_name,
        r.auction_date,
        r.name as filename
      FROM enrichment_queue eq
      JOIN runlists r ON eq.runlist_id = r.id
      WHERE eq.status IN ('queued', 'processing')
      ORDER BY eq.queued_at ASC
    `);

    return result.rows.map(row => ({
      id: row.id,
      runlistId: row.runlist_id,
      status: row.status,
      totalVehicles: row.total_vehicles,
      processedVehicles: row.processed_vehicles,
      errorCount: row.error_count,
      queuedAt: row.queued_at,
      startedAt: row.started_at,
      auctionName: row.auction_name,
      auctionDate: row.auction_date,
      filename: row.filename,
      progress: row.total_vehicles > 0
        ? Math.round((row.processed_vehicles / row.total_vehicles) * 100)
        : 0
    }));
  }

  // Get all jobs including completed/failed (for history)
  async getAllJobs(limit = 20) {
    const result = await this.pool.query(`
      SELECT
        eq.*,
        r.auction_name,
        r.auction_date,
        r.name as filename
      FROM enrichment_queue eq
      JOIN runlists r ON eq.runlist_id = r.id
      ORDER BY eq.queued_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      id: row.id,
      runlistId: row.runlist_id,
      status: row.status,
      totalVehicles: row.total_vehicles,
      processedVehicles: row.processed_vehicles,
      errorCount: row.error_count,
      queuedAt: row.queued_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      lastError: row.last_error,
      auctionName: row.auction_name,
      auctionDate: row.auction_date,
      filename: row.filename,
      progress: row.total_vehicles > 0
        ? Math.round((row.processed_vehicles / row.total_vehicles) * 100)
        : 0
    }));
  }

  // Cancel a queued or processing job
  async cancel(jobId) {
    // First try to cancel a queued job
    const result = await this.pool.query(`
      UPDATE enrichment_queue
      SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status IN ('queued', 'processing')
      RETURNING *
    `, [jobId]);

    if (result.rows.length === 0) {
      throw new Error('Job not found or cannot be cancelled');
    }

    const cancelledJob = result.rows[0];

    // If it was processing, kill the child process
    if (cancelledJob.status === 'processing' || (this.currentJob && this.currentJob.id === jobId)) {
      this.killCurrentScraper('Job cancelled by user');
    }

    this.emit('jobCancelled', { id: jobId, runlistId: cancelledJob.runlist_id });
    return cancelledJob;
  }

  // Kill the current scraper child process
  killCurrentScraper(reason) {
    if (this.currentScraperProcess && !this.currentScraperProcess.killed) {
      console.log(`[Enrichment] Killing scraper process: ${reason}`);
      this.currentScraperProcess.kill('SIGTERM');

      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (this.currentScraperProcess && !this.currentScraperProcess.killed) {
          console.log('[Enrichment] Force killing scraper process (SIGKILL)');
          this.currentScraperProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    this.stopStaleCheck();
  }

  // Start the worker loop
  startWorker() {
    if (this.workerInterval) {
      return; // Already running
    }

    console.log('Enrichment queue worker started');

    // Check for jobs every 5 seconds
    this.workerInterval = setInterval(() => {
      this.processNextJob();
    }, 5000);

    // Also process immediately on startup
    this.processNextJob();
  }

  // Stop the worker
  stopWorker() {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log('Enrichment queue worker stopped');
    }
    this.stopStaleCheck();
  }

  // Start monitoring for stale jobs (no progress for STALE_TIMEOUT_MS)
  startStaleCheck() {
    this.stopStaleCheck();
    this.lastProgressTime = Date.now();

    this.staleCheckInterval = setInterval(() => {
      if (!this.isProcessing || !this.currentJob) return;

      const elapsed = Date.now() - this.lastProgressTime;
      if (elapsed > STALE_TIMEOUT_MS) {
        const minutes = Math.round(elapsed / 60000);
        const reason = `No progress for ${minutes} minutes — likely stuck (SSO loop or network issue)`;
        console.error(`[Enrichment] ⛔ STALE JOB DETECTED: ${reason}`);

        // Mark job as failed in DB
        this.pool.query(`
          UPDATE enrichment_queue
          SET status = 'failed', last_error = $1, completed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [reason, this.currentJob.id]).catch(err => {
          console.error('[Enrichment] Failed to update stale job status:', err.message);
        });

        this.emit('jobFailed', {
          id: this.currentJob.id,
          runlistId: this.currentJob.runlist_id,
          error: reason
        });

        // Kill the scraper process
        this.killCurrentScraper(reason);
      }
    }, STALE_CHECK_INTERVAL_MS);
  }

  // Stop stale job monitoring
  stopStaleCheck() {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
    this.lastProgressTime = null;
  }

  // Resume any jobs that were processing when server restarted
  async resumeJobs() {
    const result = await this.pool.query(`
      UPDATE enrichment_queue
      SET status = 'queued', started_at = NULL
      WHERE status = 'processing'
      RETURNING *
    `);

    if (result.rows.length > 0) {
      console.log(`Resumed ${result.rows.length} interrupted enrichment jobs`);
    }

    return result.rows;
  }

  // Process the next job in queue
  async processNextJob() {
    if (this.isProcessing) {
      return; // Already processing a job
    }

    try {
      // Get next queued job
      const result = await this.pool.query(`
        SELECT
          eq.*,
          r.auction_name,
          r.auction_date
        FROM enrichment_queue eq
        JOIN runlists r ON eq.runlist_id = r.id
        WHERE eq.status = 'queued'
        ORDER BY eq.queued_at ASC
        LIMIT 1
      `);

      if (result.rows.length === 0) {
        return; // No jobs to process
      }

      const job = result.rows[0];
      this.isProcessing = true;
      this.currentJob = job;

      // Mark as processing
      await this.pool.query(`
        UPDATE enrichment_queue
        SET status = 'processing', started_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [job.id]);

      this.emit('jobStarted', {
        id: job.id,
        runlistId: job.runlist_id,
        auctionName: job.auction_name
      });

      // Process the job
      await this.runScraper(job);

    } catch (err) {
      console.error('Error processing enrichment job:', err);
      if (this.currentJob) {
        await this.pool.query(`
          UPDATE enrichment_queue
          SET status = 'failed', last_error = $1, completed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [err.message, this.currentJob.id]);

        this.emit('jobFailed', {
          id: this.currentJob.id,
          error: err.message
        });
      }
    } finally {
      this.isProcessing = false;
      this.currentJob = null;
    }
  }

  // Run the scraper for a job
  async runScraper(job) {
    return new Promise(async (resolve, reject) => {
      // Get vehicles that need scraping
      const vehicles = await this.pool.query(`
        SELECT id, vin, year, make, model
        FROM runlist_vehicles
        WHERE runlist_id = $1 AND matched = true AND scraped = false
      `, [job.runlist_id]);

      if (vehicles.rows.length === 0) {
        // No vehicles to scrape - mark as complete
        await this.pool.query(`
          UPDATE enrichment_queue
          SET status = 'completed', completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [job.id]);

        this.emit('jobCompleted', {
          id: job.id,
          runlistId: job.runlist_id,
          processed: 0,
          errors: 0
        });

        return resolve();
      }

      // Create temp CSV with VINs
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const tempCsvPath = path.join(uploadsDir, `enrich-${job.runlist_id}-${Date.now()}.csv`);
      const csvContent = 'Vin,Year,Make,Model\n' +
        vehicles.rows.map(v => `${v.vin},${v.year},${v.make},${v.model}`).join('\n');
      fs.writeFileSync(tempCsvPath, csvContent);

      const auctionName = `${job.auction_name} (${job.auction_date})`;
      const scraperPath = path.join(__dirname, '..', 'auction-scraper', 'autoniq-scraper.js');

      // Spawn scraper and store reference for kill support
      const scraper = spawn('node', [scraperPath, tempCsvPath, auctionName]);
      this.currentScraperProcess = scraper;

      // Start stale job monitoring
      this.startStaleCheck();

      let processed = 0;
      let errors = 0;
      const total = vehicles.rows.length;

      scraper.stdout.on('data', async (data) => {
        const text = data.toString();

        // Split into lines and process each
        const lines = text.split('\n').filter(line => line.trim());
        let updatedThisChunk = false;

        for (const line of lines) {
          console.log('[Enrichment]', line.trim());

          // Track progress - match scraper output format: "✓ VIN - Grade: X.X | announcement"
          if (line.includes('✓') && (line.includes('Grade:') || line.includes('already scraped') || line.includes('N/A'))) {
            processed++;
            updatedThisChunk = true;
          }

          // Track errors
          if (line.includes('✗') && line.includes('Error:')) {
            errors++;
            updatedThisChunk = true;
          }
        }

        // Update database and emit progress if anything changed
        if (updatedThisChunk) {
          // Reset stale timer on any progress (success or tracked error)
          this.lastProgressTime = Date.now();

          try {
            await this.pool.query(`
              UPDATE enrichment_queue
              SET processed_vehicles = $1, error_count = $2
              WHERE id = $3
            `, [processed, errors, job.id]);

            // Emit progress event
            this.emit('progress', {
              id: job.id,
              runlistId: job.runlist_id,
              processed,
              total,
              progress: Math.round((processed / total) * 100),
              auctionName: job.auction_name
            });
          } catch (err) {
            console.error('[Enrichment] Failed to update progress:', err.message);
          }
        }
      });

      scraper.stderr.on('data', (data) => {
        console.error('[Enrichment Error]', data.toString());
        // Stderr output counts as activity (scraper is still running)
        this.lastProgressTime = Date.now();
      });

      scraper.on('close', async (code) => {
        // Clean up
        this.currentScraperProcess = null;
        this.stopStaleCheck();
        fs.unlink(tempCsvPath, () => {});

        // Check if job was already marked as failed/cancelled by stale check or cancel
        const currentStatus = await this.pool.query(
          'SELECT status FROM enrichment_queue WHERE id = $1',
          [job.id]
        );
        const alreadyHandled = currentStatus.rows.length > 0 &&
          ['failed', 'cancelled'].includes(currentStatus.rows[0].status);

        if (alreadyHandled) {
          // Job was killed by stale check or cancel — don't overwrite status
          return resolve();
        }

        if (code === 0) {
          // Mark vehicles as scraped
          await this.pool.query(`
            UPDATE runlist_vehicles
            SET scraped = true
            WHERE runlist_id = $1 AND matched = true
          `, [job.runlist_id]);

          // Update runlist status
          await this.pool.query(`
            UPDATE runlists SET status = 'scraped' WHERE id = $1
          `, [job.runlist_id]);

          // Mark job complete
          await this.pool.query(`
            UPDATE enrichment_queue
            SET status = 'completed', processed_vehicles = $1, completed_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [processed, job.id]);

          this.emit('jobCompleted', {
            id: job.id,
            runlistId: job.runlist_id,
            processed,
            errors,
            auctionName: job.auction_name
          });

          resolve();
        } else {
          const errorMsg = code === null
            ? 'Scraper process was killed (timeout or cancellation)'
            : `Scraper exited with code ${code}`;

          await this.pool.query(`
            UPDATE enrichment_queue
            SET status = 'failed', last_error = $1, completed_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [errorMsg, job.id]);

          this.emit('jobFailed', {
            id: job.id,
            runlistId: job.runlist_id,
            error: errorMsg
          });

          reject(new Error(errorMsg));
        }
      });

      scraper.on('error', async (err) => {
        this.currentScraperProcess = null;
        this.stopStaleCheck();
        fs.unlink(tempCsvPath, () => {});

        await this.pool.query(`
          UPDATE enrichment_queue
          SET status = 'failed', last_error = $1, completed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [err.message, job.id]);

        this.emit('jobFailed', {
          id: job.id,
          runlistId: job.runlist_id,
          error: err.message
        });

        reject(err);
      });
    });
  }
}

module.exports = EnrichmentQueue;
