const express = require('express');
const { runQuery } = require('../db');
const asyncHandler = require('./asyncHandler');

const router = express.Router();

// GET /api/groups?search=
router.get('/', asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const records = await runQuery(
    `MATCH (g:Group)
     WHERE toLower(g.name) CONTAINS toLower($search)
     OPTIONAL MATCH (g)<-[:MEMBER_OF]-(m:User)
     WITH g, count(DISTINCT m) AS memberCount
     OPTIONAL MATCH (g)-[:FOCUSES_ON]->(i:Interest)
     RETURN g.id AS id, g.name AS name, g.description AS description,
            memberCount, collect(DISTINCT i.name) AS focusInterests
     ORDER BY memberCount DESC`,
    { search }
  );
  res.json(records.map((r) => r.toObject()));
}));

// GET /api/groups/:id — detail with members, focus interests, upcoming events
router.get('/:id', asyncHandler(async (req, res) => {
  const groupRecords = await runQuery(
    `MATCH (g:Group {id: $id})
     OPTIONAL MATCH (g)-[:FOCUSES_ON]->(i:Interest)
     WITH g, collect(DISTINCT i.name) AS focusInterests
     RETURN g.id AS id, g.name AS name, g.description AS description, focusInterests`,
    { id: req.params.id }
  );
  if (!groupRecords.length) return res.status(404).json({ error: 'Group not found' });

  const memberRecords = await runQuery(
    `MATCH (g:Group {id: $id})<-[:MEMBER_OF]-(u:User)
     RETURN u.id AS id, u.name AS name, u.avatarColor AS avatarColor
     ORDER BY u.name
     LIMIT 40`,
    { id: req.params.id }
  );

  const eventRecords = await runQuery(
    `MATCH (g:Group {id: $id})<-[:HOSTED_BY]-(e:Event)
     RETURN e.id AS id, e.name AS name, e.date AS date, e.location AS location
     ORDER BY e.date ASC`,
    { id: req.params.id }
  );

  res.json({
    ...groupRecords[0].toObject(),
    members: memberRecords.map((r) => r.toObject()),
    events: eventRecords.map((r) => r.toObject()),
  });
}));

module.exports = router;
