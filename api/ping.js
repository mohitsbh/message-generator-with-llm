// Simple ping endpoint to verify Vercel API routing
module.exports = (req, res) => {
  if (req.method === 'GET') return res.status(200).send('pong');
  return res.status(200).json({ ok: true, method: req.method });
};

// also provide common alternate exports for compatibility
module.exports.default = module.exports;
module.exports.handler = module.exports;
