const express = require('express');
const { runQuery } = require('../db');
const asyncHandler = require('./asyncHandler');

const router = express.Router();

// GET /api/events?limit=
router.get('/', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 30;
  const records = await runQuery(
    `MATCH (e:Event)-[:HOSTED_BY]->(g:Group)
     OPTIONAL MATCH (e)<-[:ATTENDED]-(attendee:User)
     WITH e, g, count(DISTINCT attendee) AS attendeeCount
     OPTIONAL MATCH (e)-[:RELATED_TO]->(i:Interest)
     RETURN e.id AS id, e.name AS name, e.date AS date, e.location AS location,
            g.name AS groupName, g.id AS groupId, attendeeCount,
            collect(DISTINCT i.name) AS relatedInterests
     ORDER BY e.date ASC
     LIMIT $limit`,
    { limit }
  );
  res.json(records.map((r) => r.toObject()));
}));

module.exports = router;
