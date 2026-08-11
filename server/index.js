// server/index.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const { checkConnection } = require('./db');

const usersRouter = require('./routes/users');
const groupsRouter = require('./routes/groups');
const eventsRouter = require('./routes/events');
const pathRouter = require('./routes/path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check — also used by the frontend to show a friendly "database
// unreachable" state instead of a blank/broken UI.
app.get('/api/health', async (req, res) => {
  const status = await checkConnection();
  res.status(status.ok ? 200 : 503).json(status);
});

app.use('/api/users', usersRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/path', pathRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Centralised error handler: any route that throws (including "CognoDB is
// unreachable") ends up here rather than crashing the process or leaking
// a stack trace to the client.
app.use((err, req, res, next) => {
  console.error(err);
  const isConnError = /ServiceUnavailable|connect|ECONNREFUSED|Missing COGNODB/i.test(err.message || '');
  res.status(isConnError ? 503 : 500).json({
    error: isConnError
      ? 'The database is unreachable right now. Please try again shortly.'
      : 'Something went wrong on our end.',
  });
});

app.listen(PORT, async () => {
  console.log(`Circles running on http://localhost:${PORT}`);
  const status = await checkConnection();
  if (!status.ok) {
    console.warn(`Warning: could not reach CognoDB at startup (${status.message}).`);
    console.warn('The app will still start, but API calls will return 503 until the database is reachable.');
  } else {
    console.log('Connected to CognoDB.');
  }
});
