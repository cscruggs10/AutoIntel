require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const apiRoutes = require('./routes/api');
const bidListRoutes = require('./routes/bid-list');

// Load journal routes if available (local only, not in repo)
let journalRoutes;
try {
  journalRoutes = require('./routes/journal');
} catch (err) {
  // Journal routes not available (optional feature)
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configure file upload
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files allowed'));
    }
    cb(null, true);
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'autointel-temp-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// API Routes
app.use('/api', apiRoutes);
app.use('/api/bid-list', bidListRoutes);

// Journal routes (optional, local only)
if (journalRoutes) {
  app.use('/api/journal', journalRoutes);
  app.get('/journal', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'journal.html'));
  });
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'autointel.html'));
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/autointel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'autointel.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'AutoIntel' });
});

// Scrape endpoint with streaming progress
app.post('/api/scrape', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { auctionName, auctionDate } = req.body;
  
  if (!auctionName || !auctionDate) {
    return res.status(400).json({ error: 'Missing auction name or date' });
  }

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const csvPath = req.file.path;
  const fullAuctionName = `${auctionName} (${auctionDate})`;

  // Spawn scraper process
  const scraperPath = path.join(__dirname, 'auction-scraper', 'autoniq-scraper.js');
  const scraper = spawn('node', [scraperPath, csvPath, fullAuctionName]);

  let output = '';
  let processed = 0;
  let errors = 0;
  let total = 0;
  const startTime = Date.now();

  // Send initial progress
  res.write(`data: ${JSON.stringify({ progress: 0, message: 'Starting scraper...' })}\n\n`);

  // Parse stdout
  scraper.stdout.on('data', (data) => {
    const text = data.toString();
    output += text;
    console.log(text);

    // Parse progress from scraper output
    const loadedMatch = text.match(/Loaded (\d+) vehicles/);
    if (loadedMatch) {
      total = parseInt(loadedMatch[1]);
      res.write(`data: ${JSON.stringify({ 
        progress: 5, 
        message: `Loaded ${total} vehicles from runlist` 
      })}\n\n`);
    }

    // Count processed vehicles
    if (text.includes('✓') && text.includes('announcements found')) {
      processed++;
      const progress = total > 0 ? Math.min(95, Math.floor((processed / total) * 100)) : 50;
      res.write(`data: ${JSON.stringify({ 
        progress, 
        message: `Processing: ${processed}/${total} vehicles` 
      })}\n\n`);
    }

    // Count errors
    if (text.includes('✗') && text.includes('Error:')) {
      errors++;
    }

    // Completion
    if (text.includes('=== Scraping Complete ===')) {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      res.write(`data: ${JSON.stringify({ 
        progress: 100,
        complete: true,
        processed,
        errors,
        total,
        duration,
        message: 'Complete!' 
      })}\n\n`);
    }
  });

  scraper.stderr.on('data', (data) => {
    console.error('Scraper error:', data.toString());
  });

  scraper.on('close', (code) => {
    if (code !== 0 && !output.includes('=== Scraping Complete ===')) {
      res.write(`data: ${JSON.stringify({ 
        error: 'Scraper process failed',
        code 
      })}\n\n`);
    }
    res.end();
  });

  scraper.on('error', (err) => {
    console.error('Failed to start scraper:', err);
    res.write(`data: ${JSON.stringify({ 
      error: 'Failed to start scraper: ' + err.message 
    })}\n\n`);
    res.end();
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AutoIntel running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
