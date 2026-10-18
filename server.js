const path = require('path');
const express = require('express');
const { pool, ready } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));
// Vendored front-end packages, so the page needs no CDN access.
app.use('/vendor/hls', express.static(path.join(__dirname, 'node_modules/hls.js/dist')));
app.use('/vendor/fonts/montserrat', express.static(path.join(__dirname, 'node_modules/@fontsource/montserrat')));
app.use('/vendor/fonts/open-sans', express.static(path.join(__dirname, 'node_modules/@fontsource/open-sans')));

// Reports 503 when the database is unreachable, so orchestrators and the
// container health check see a broken backend, not just a live process.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'database unavailable' });
  }
});

app.get('/api/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/users', async (req, res, next) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

if (require.main === module) {
  ready
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Database setup failed:', err.message);
      process.exit(1);
    });
}

module.exports = { app, pool, ready };
