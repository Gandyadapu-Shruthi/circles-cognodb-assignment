const express = require('express');
const { runQuery } = require('../db');
const asyncHandler = require('./asyncHandler');

const router = express.Router();

// GET /api/path?from=&to=
// Variable-length shortest path between two people — "six degrees of
// separation". This kind of unbounded-depth traversal has no clean SQL
// equivalent; here it's a single Cypher clause.
router.get('/', asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'Both from and to query params are required.' });

  if (from === to) {
    const records = await runQuery(
      `MATCH (u:User {id: $from}) RETURN u.id AS id, u.name AS name, u.avatarColor AS avatarColor`,
      { from }
    );
    if (!records.length) return res.status(404).json({ error: 'User not found' });
    const person = records[0].toObject();
    return res.json({ found: true, hops: 0, path: [person] });
  }

  const records = await runQuery(
    `MATCH (a:User {id: $from}), (b:User {id: $to})
     OPTIONAL MATCH p = shortestPath((a)-[:FRIENDS_WITH*..6]-(b))
     RETURN p IS NOT NULL AS found,
            CASE WHEN p IS NOT NULL THEN length(p) ELSE null END AS hops,
            CASE WHEN p IS NOT NULL
                 THEN [n IN nodes(p) | {id: n.id, name: n.name, avatarColor: n.avatarColor}]
                 ELSE null END AS path`,
    { from, to }
  );

  if (!records.length) return res.status(404).json({ error: 'One or both users not found.' });
  res.json(records[0].toObject());
}));

module.exports = router;
