const express = require('express');
const router = express.Router();

// Placeholder routes - will build these out
router.get('/status', (req, res) => {
  res.json({ 
    message: 'AutoIntel API',
    version: '1.0.0',
    status: 'operational'
  });
});

router.post('/runlist/upload', (req, res) => {
  // TODO: Handle runlist CSV upload
  res.json({ message: 'Upload endpoint - coming soon' });
});

router.get('/results', (req, res) => {
  // TODO: Fetch auction results
  res.json({ message: 'Results endpoint - coming soon' });
});

module.exports = router;
