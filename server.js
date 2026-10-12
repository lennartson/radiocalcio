const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json(users);
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  const result = db
    .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
    .run(name, email);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(user);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
