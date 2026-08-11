// server/db.js
//
// Thin wrapper around the official Neo4j driver, pointed at a CognoDB
// instance. CognoDB speaks openCypher over Bolt, so the stock driver
// works unmodified — no custom SDK needed.

const neo4j = require('neo4j-driver');

const {
  COGNODB_URI,
  COGNODB_USER = 'cognodb',
  COGNODB_PASSWORD,
} = process.env;

let driver = null;
let connectionError = null;

function getDriver() {
  if (driver) return driver;
  if (!COGNODB_URI || !COGNODB_PASSWORD) {
    connectionError = new Error(
      'Missing COGNODB_URI or COGNODB_PASSWORD environment variables. ' +
      'Copy .env.example to .env and fill in your CognoDB Cloud connection details.'
    );
    throw connectionError;
  }
  driver = neo4j.driver(
    COGNODB_URI,
    neo4j.auth.basic(COGNODB_USER, COGNODB_PASSWORD),
    { maxConnectionPoolSize: 20 }
  );
  return driver;
}

// Verifies connectivity without throwing — used by the /api/health route
// and on server startup so a database outage never crashes the process.
async function checkConnection() {
  try {
    const d = getDriver();
    await d.verifyConnectivity();
    connectionError = null;
    return { ok: true };
  } catch (err) {
    connectionError = err;
    return { ok: false, message: err.message };
  }
}

// Runs a single parameterised Cypher statement in its own session.
// Always use parameters ($param) — never string-concatenate values into
// the query text.
async function runQuery(cypher, params = {}) {
  const d = getDriver();
  const session = d.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

// Runs a write transaction (used by seed script and the "add friend" route).
async function runWrite(cypher, params = {}) {
  const d = getDriver();
  const session = d.session();
  try {
    return await session.executeWrite((tx) => tx.run(cypher, params));
  } finally {
    await session.close();
  }
}

async function close() {
  if (driver) await driver.close();
}

module.exports = { getDriver, checkConnection, runQuery, runWrite, close };
