'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3847;

// ── Database setup ──────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'worksheets.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS worksheet_data (
    worksheet  TEXT NOT NULL,
    field_id   TEXT NOT NULL,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (worksheet, field_id)
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO worksheet_data (worksheet, field_id, value, updated_at)
  VALUES (@worksheet, @field_id, @value, datetime('now'))
  ON CONFLICT(worksheet, field_id)
  DO UPDATE SET value = @value, updated_at = datetime('now')
`);

const getStmt = db.prepare(`
  SELECT field_id, value FROM worksheet_data
  WHERE worksheet = @worksheet
`);

const deleteStmt = db.prepare(`
  DELETE FROM worksheet_data
  WHERE worksheet = @worksheet
`);

// ── Middleware ───────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

app.use(cors({ origin: false }));

app.use(morgan('short'));

app.use(express.json({ limit: '50kb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Serve static files ONLY from public/
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
}));

// ── Input validation helpers ────────────────────────────────────────

const MAX_WORKSHEET = 200;
const MAX_FIELD_ID = 100;
const MAX_VALUE = 10000;

function validateString(val, maxLen, label) {
  if (typeof val !== 'string' || val.length === 0) {
    return `Missing ${label}`;
  }
  if (val.length > maxLen) {
    return `${label} too long (max ${maxLen})`;
  }
  return null;
}

// ── API routes ──────────────────────────────────────────────────────

// GET /api/worksheet/:worksheet
app.get('/api/worksheet/:worksheet', (req, res) => {
  const worksheet = req.params.worksheet;

  const err = validateString(worksheet, MAX_WORKSHEET, 'worksheet');
  if (err) return res.status(400).json({ error: err });

  const rows = getStmt.all({ worksheet });
  const fields = {};
  for (const row of rows) {
    fields[row.field_id] = row.value;
  }

  res.json({ fields });
});

// POST /api/worksheet/:worksheet
// Body: { fields: { fieldId: value, ... } }
app.post('/api/worksheet/:worksheet', (req, res) => {
  const worksheet = req.params.worksheet;
  const { fields } = req.body;

  const err = validateString(worksheet, MAX_WORKSHEET, 'worksheet');
  if (err) return res.status(400).json({ error: err });

  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const entries = Object.entries(fields);

  // Validate each field
  for (const [fid, fval] of entries) {
    const fErr = validateString(fid, MAX_FIELD_ID, 'field_id');
    if (fErr) return res.status(400).json({ error: fErr });
    if (typeof fval !== 'string') {
      return res.status(400).json({ error: `field value for "${fid}" must be string` });
    }
    if (fval.length > MAX_VALUE) {
      return res.status(400).json({ error: `field value for "${fid}" too long` });
    }
  }

  const upsertMany = db.transaction((items) => {
    for (const [field_id, value] of items) {
      upsertStmt.run({ worksheet, field_id, value: value || '' });
    }
  });

  upsertMany(entries);
  res.json({ ok: true });
});

// DELETE /api/worksheet/:worksheet
app.delete('/api/worksheet/:worksheet', (req, res) => {
  const worksheet = req.params.worksheet;

  const err = validateString(worksheet, MAX_WORKSHEET, 'worksheet');
  if (err) return res.status(400).json({ error: err });

  deleteStmt.run({ worksheet });
  res.json({ ok: true });
});

// API 404 fallback
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ───────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start + graceful shutdown ───────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`BumTeacherBypass running at http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`\n${signal} received – shutting down...`);
  server.close(() => {
    db.close();
    console.log('Database closed. Goodbye.');
    process.exit(0);
  });
  // Force close after 5 s
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
