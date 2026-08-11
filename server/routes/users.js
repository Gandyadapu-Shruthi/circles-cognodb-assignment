const express = require('express');
const { runQuery, runWrite } = require('../db');
const asyncHandler = require('./asyncHandler');

const router = express.Router();

// GET /api/users?search=&limit=
router.get('/', asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const limit = neo4jInt(req.query.limit, 20);
  const records = await runQuery(
    `MATCH (u:User)
     WHERE toLower(u.name) CONTAINS toLower($search)
     OPTIONAL MATCH (u)-[:LIVES_IN]->(c:City)
     WITH u, c
     OPTIONAL MATCH (u)-[:INTERESTED_IN]->(i:Interest)
     WITH u, c, collect(DISTINCT i.name)[0..3] AS topInterests
     RETURN u.id AS id, u.name AS name, u.age AS age, c.name AS city,
            u.avatarColor AS avatarColor, topInterests
     ORDER BY u.name
     LIMIT $limit`,
    { search, limit }
  );
  res.json(records.map((r) => r.toObject()));
}));

// GET /api/users/:id — full profile
router.get('/:id', asyncHandler(async (req, res) => {
  const records = await runQuery(
    `MATCH (u:User {id: $id})
     OPTIONAL MATCH (u)-[:LIVES_IN]->(c:City)
     WITH u, c
     OPTIONAL MATCH (u)-[:INTERESTED_IN]->(i:Interest)
     WITH u, c, collect(DISTINCT {id: i.id, name: i.name, category: i.category}) AS interests
     OPTIONAL MATCH (u)-[:MEMBER_OF]->(g:Group)
     WITH u, c, interests, collect(DISTINCT {id: g.id, name: g.name}) AS groups
     OPTIONAL MATCH (u)-[:FRIENDS_WITH]->(f:User)
     RETURN u.id AS id, u.name AS name, u.age AS age, u.bio AS bio, u.avatarColor AS avatarColor,
            c.name AS city, interests, groups, count(DISTINCT f) AS friendCount`,
    { id: req.params.id }
  );
  if (!records.length) return res.status(404).json({ error: 'User not found' });
  res.json(records[0].toObject());
}));

// GET /api/users/:id/friends
router.get('/:id/friends', asyncHandler(async (req, res) => {
  const records = await runQuery(
    `MATCH (u:User {id: $id})-[:FRIENDS_WITH]->(f:User)
     OPTIONAL MATCH (f)-[:LIVES_IN]->(c:City)
     RETURN f.id AS id, f.name AS name, f.avatarColor AS avatarColor, c.name AS city
     ORDER BY f.name`,
    { id: req.params.id }
  );
  res.json(records.map((r) => r.toObject()));
}));

// GET /api/users/:id/recommendations/people
// The core "people you may know" query: a 2-hop traversal through mutual
// friends, excluding people already connected, ranked by mutual-friend
// count plus shared interests. This kind of variable-fan-out join is
// exactly what relational databases struggle with at scale.
router.get('/:id/recommendations/people', asyncHandler(async (req, res) => {
  const limit = neo4jInt(req.query.limit, 8);
  const records = await runQuery(
    `MATCH (me:User {id: $id})-[:FRIENDS_WITH]->(mutual:User)-[:FRIENDS_WITH]->(candidate:User)
     WHERE candidate <> me AND NOT (me)-[:FRIENDS_WITH]->(candidate)
     WITH me, candidate, count(DISTINCT mutual) AS mutualFriends
     OPTIONAL MATCH (me)-[:INTERESTED_IN]->(shared:Interest)<-[:INTERESTED_IN]-(candidate)
     WITH me, candidate, mutualFriends, count(DISTINCT shared) AS sharedInterests
     OPTIONAL MATCH (candidate)-[:LIVES_IN]->(c:City)
     OPTIONAL MATCH (candidate)-[:INTERESTED_IN]->(anyInterest:Interest)
     RETURN candidate.id AS id, candidate.name AS name, candidate.avatarColor AS avatarColor,
            c.name AS city, mutualFriends, sharedInterests,
            collect(DISTINCT anyInterest.name)[0..3] AS topInterests
     ORDER BY (mutualFriends + sharedInterests) DESC, mutualFriends DESC
     LIMIT $limit`,
    { id: req.params.id, limit }
  );
  res.json(records.map((r) => r.toObject()));
}));

// GET /api/users/:id/recommendations/groups
router.get('/:id/recommendations/groups', asyncHandler(async (req, res) => {
  const limit = neo4jInt(req.query.limit, 6);
  const records = await runQuery(
    `MATCH (me:User {id: $id})-[:FRIENDS_WITH]->(friend:User)-[:MEMBER_OF]->(g:Group)
     WHERE NOT (me)-[:MEMBER_OF]->(g)
     WITH me, g, count(DISTINCT friend) AS friendsInGroup
     OPTIONAL MATCH (me)-[:INTERESTED_IN]->(shared:Interest)<-[:FOCUSES_ON]-(g)
     WITH g, friendsInGroup, count(DISTINCT shared) AS sharedInterestCount
     RETURN g.id AS id, g.name AS name, g.description AS description,
            friendsInGroup, sharedInterestCount
     ORDER BY (friendsInGroup + sharedInterestCount) DESC
     LIMIT $limit`,
    { id: req.params.id, limit }
  );
  res.json(records.map((r) => r.toObject()));
}));

// GET /api/users/:id/recommendations/events
router.get('/:id/recommendations/events', asyncHandler(async (req, res) => {
  const limit = neo4jInt(req.query.limit, 6);
  const records = await runQuery(
    `MATCH (me:User {id: $id})-[:INTERESTED_IN]->(interest:Interest)<-[:RELATED_TO]-(e:Event)
     WITH me, e, count(DISTINCT interest) AS interestMatch
     OPTIONAL MATCH (me)-[:FRIENDS_WITH]->(friend:User)-[:ATTENDED]->(e)
     WITH e, interestMatch, count(DISTINCT friend) AS friendsGoing
     OPTIONAL MATCH (e)-[:HOSTED_BY]->(g:Group)
     RETURN e.id AS id, e.name AS name, e.date AS date, e.location AS location,
            g.name AS groupName, interestMatch, friendsGoing
     ORDER BY e.date ASC, (friendsGoing * 2 + interestMatch) DESC
     LIMIT $limit`,
    { id: req.params.id, limit }
  );
  res.json(records.map((r) => r.toObject()));
}));

// POST /api/users/:fromId/friend/:toId — create a mutual friendship.
// Demonstrates a parameterised write; MERGE keeps it idempotent.
router.post('/:fromId/friend/:toId', asyncHandler(async (req, res) => {
  const { fromId, toId } = req.params;
  if (fromId === toId) return res.status(400).json({ error: "Can't friend yourself." });
  await runWrite(
    `MATCH (a:User {id: $fromId}), (b:User {id: $toId})
     MERGE (a)-[:FRIENDS_WITH]->(b)
     MERGE (b)-[:FRIENDS_WITH]->(a)`,
    { fromId, toId }
  );
  res.json({ ok: true });
}));

function neo4jInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

module.exports = router;
