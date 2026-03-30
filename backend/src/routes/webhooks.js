const express = require('express');

const router = express.Router();

router.post('/docusign', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
  res.status(202).json({
    success: true,
    discarded: true
  });
});

module.exports = router;
