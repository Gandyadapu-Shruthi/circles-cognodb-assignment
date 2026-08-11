// scripts/seed.js
//
// Generates a realistic synthetic social graph and loads it into CognoDB
// using batched, parameterised Cypher (UNWIND) — no string concatenation.
//
// Run with: npm run seed

require('dotenv').config();
const { getDriver, checkConnection, close } = require('../server/db');

// ---------------------------------------------------------------------
// 1. Synthetic data generation
// ---------------------------------------------------------------------

const FIRST_NAMES = [
  'Ava','Liam','Maya','Noah','Zara','Ethan','Priya','Mason','Sofia','Kai',
  'Leah','Diego','Nina','Omar','Ruby','Felix','Amara','Theo','Ines','Jonah',
  'Yuki','Marcus','Elena','Idris','Sana','Owen','Lucia','Amir','Freya','Tariq',
  'Nadia','Caleb','Hana','Rafael','Isla','Kofi','Mira','Dante','Aisha','Wyatt',
  'Chloe','Iman','Silas','Rosa','Bilal','Wren','Kenji','Tessa','Malik','Junie'
];
const LAST_NAMES = [
  'Whitfield','Nakamura','Okafor','Delgado','Bergstrom','Kaur','Novak','Ferreira',
  'Larsson','Haddad','Moreau','Petrova','Osei','Castillo','Lindgren','Suzuki',
  'Adeyemi','Rossi','Volkov','Nwosu','Kowalski','Herrera','Sato','Brennan',
  'Mensah','Abara','Lindqvist','Kimura','Duarte','Sokolov'
];
const CITIES = [
  'Austin','Berlin','Toronto','Nairobi','Lisbon','Seoul','Melbourne','Bogota',
  'Amsterdam','Cape Town','Denver','Manila','Warsaw','Santiago','Osaka','Dublin'
];
const INTERESTS = [
  ['Bouldering','Outdoors'], ['Trail Running','Outdoors'], ['Cycling','Outdoors'],
  ['Board Games','Games'], ['Chess','Games'], ['TTRPGs','Games'],
  ['Jazz','Music'], ['Synth Music','Music'], ['Choir Singing','Music'],
  ['Pottery','Arts'], ['Street Photography','Arts'], ['Life Drawing','Arts'],
  ['Fermentation','Food'], ['Ramen','Food'], ['Baking','Food'],
  ['Generative Art','Tech'], ['Open Source','Tech'], ['Robotics','Tech'],
  ['Yoga','Wellness'], ['Cold Water Swimming','Wellness'], ['Meditation','Wellness'],
  ['Urban Sketching','Arts'], ['Vinyl Collecting','Music'], ['Sourdough','Food'],
  ['Climbing Gyms','Outdoors'], ['Language Exchange','Social'], ['Book Clubs','Social'],
  ['Improv Comedy','Social']
];
const BIO_FRAGMENTS = [
  'Usually found with a coffee and a half-finished side project.',
  'Perpetually organizing something for too many people.',
  'New in town and looking for people to get lost with.',
  'Collects hobbies faster than furniture.',
  'Here for the conversations, staying for the community.',
  'Trying to say yes to more weird plans this year.',
  'Spends weekends outdoors, weekdays indoors, regretting nothing.',
  'Still figuring out what this city is good for.'
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  n = Math.min(n, copy.length);
  for (let i = 0; i < n; i++) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const USER_COUNT = 160;

function buildUsers() {
  const used = new Set();
  const users = [];
  for (let i = 0; i < USER_COUNT; i++) {
    let name;
    do {
      name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    } while (used.has(name));
    used.add(name);
    users.push({
      id: `u${i + 1}`,
      name,
      age: randInt(21, 58),
      city: pick(CITIES),
      bio: pick(BIO_FRAGMENTS),
      avatarColor: pick(['#E8B04B', '#8C7AE6', '#E8836B', '#5FB0A6', '#6C8FE8']),
    });
  }
  return users;
}

function buildInterests() {
  return INTERESTS.map(([name, category], i) => ({ id: `i${i + 1}`, name, category }));
}

// Each user gets 3-6 interests, weighted so some interests are more popular
// (creates realistic clustering rather than a uniform random graph).
function buildUserInterests(users, interests) {
  const links = [];
  for (const u of users) {
    const count = randInt(3, 6);
    for (const interest of pickN(interests, count)) {
      links.push({ userId: u.id, interestId: interest.id, strength: randInt(1, 5) });
    }
  }
  return links;
}

// Friendships: each user befriends people who share at least one interest
// more often than strangers, which produces realistic homophily-driven
// clustering — the kind of structure that makes "friends of friends who
// share your interests" a meaningful, non-random query.
function buildFriendships(users, userInterests) {
  const interestToUsers = {};
  for (const link of userInterests) {
    (interestToUsers[link.interestId] ||= []).push(link.userId);
  }
  const pairs = new Set();
  const friendships = [];

  function addFriendship(a, b) {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    friendships.push({ a, b });
  }

  for (const u of users) {
    const myInterests = userInterests.filter((l) => l.userId === u.id).map((l) => l.interestId);
    const candidatePool = new Set();
    for (const interestId of myInterests) {
      for (const otherId of interestToUsers[interestId] || []) {
        if (otherId !== u.id) candidatePool.add(otherId);
      }
    }
    const candidates = [...candidatePool];
    const friendCount = randInt(2, 6);
    for (const otherId of pickN(candidates, Math.min(friendCount, candidates.length))) {
      addFriendship(u.id, otherId);
    }
    // One random long-range friendship (probabilistic) so the graph stays
    // connected across interest clusters without flattening path lengths —
    // keeps the six-degrees path finder demo meaningful.
    if (Math.random() < 0.6) {
      for (const otherId of pickN(users.map((x) => x.id), 1)) {
        addFriendship(u.id, otherId);
      }
    }
  }
  return friendships;
}

const GROUP_TEMPLATES = [
  ['Austin Boulder Collective', ['Bouldering', 'Climbing Gyms']],
  ['Nightowl Synth Society', ['Synth Music', 'Vinyl Collecting']],
  ['Sourdough & Co', ['Sourdough', 'Baking', 'Fermentation']],
  ['Open Source Saturdays', ['Open Source', 'Robotics', 'Generative Art']],
  ['Cold Plunge Club', ['Cold Water Swimming', 'Wellness']],
  ['Downtown Chess League', ['Chess', 'Board Games']],
  ['Wandering Sketchers', ['Urban Sketching', 'Street Photography', 'Life Drawing']],
  ['Ramen Pilgrims', ['Ramen', 'Food']],
  ['The Improv Basement', ['Improv Comedy', 'Book Clubs']],
  ['Trailhead Runners', ['Trail Running', 'Outdoors']],
  ['Kiln & Wheel Pottery Studio', ['Pottery', 'Arts']],
  ['Tabletop Tuesdays', ['TTRPGs', 'Board Games']],
  ['Sunrise Yoga Circle', ['Yoga', 'Meditation']],
  ['Language Swap Meetups', ['Language Exchange', 'Social']],
  ['Jazz Basement Sessions', ['Jazz', 'Choir Singing']],
  ['Cycle & Espresso', ['Cycling', 'Food']],
  ['Generative Art Lab', ['Generative Art', 'Tech']],
  ['Community Choir Project', ['Choir Singing', 'Music']],
];

function buildGroups(interests) {
  const byName = Object.fromEntries(interests.map((i) => [i.name, i.id]));
  return GROUP_TEMPLATES.map(([name, focusNames], i) => ({
    id: `g${i + 1}`,
    name,
    description: `A community for people into ${focusNames.join(' and ').toLowerCase()}.`,
    focusInterestIds: focusNames.map((n) => byName[n]).filter(Boolean),
  }));
}

// Group membership: pulled from users already interested in the group's
// focus areas (with a small chance for anyone else), so groups feel like
// real communities rather than random buckets.
function buildMemberships(users, userInterests, groups) {
  const links = [];
  for (const group of groups) {
    const interested = users.filter((u) =>
      userInterests.some((l) => l.userId === u.id && group.focusInterestIds.includes(l.interestId))
    );
    const memberCount = randInt(12, 35);
    const members = pickN(interested.length ? interested : users, Math.min(memberCount, users.length));
    for (const m of members) {
      links.push({ userId: m.id, groupId: group.id, since: `${randInt(2021, 2026)}-0${randInt(1, 9)}-1${randInt(0, 8)}` });
    }
  }
  return links;
}

const EVENT_VERBS = ['Meetup', 'Workshop', 'Social', 'Jam', 'Crawl', 'Open Studio', 'Showcase'];

function buildEvents(groups) {
  const events = [];
  let idx = 1;
  for (const group of groups) {
    const count = randInt(2, 3);
    for (let i = 0; i < count; i++) {
      events.push({
        id: `e${idx++}`,
        name: `${group.name.split(' ').slice(0, 2).join(' ')} ${pick(EVENT_VERBS)}`,
        date: `2026-${String(randInt(8, 12)).padStart(2, '0')}-${String(randInt(1, 27)).padStart(2, '0')}`,
        location: pick(CITIES),
        groupId: group.id,
        relatedInterestIds: pickN(group.focusInterestIds, randInt(1, Math.min(2, group.focusInterestIds.length))),
      });
    }
  }
  return events;
}

// Attendance: drawn mostly from group members, occasionally from outside —
// this is what powers "events your friends went to" style queries.
function buildAttendance(memberships, events) {
  const links = [];
  const membersByGroup = {};
  for (const m of memberships) (membersByGroup[m.groupId] ||= []).push(m.userId);
  for (const ev of events) {
    const pool = membersByGroup[ev.groupId] || [];
    const attendeeCount = Math.min(pool.length, randInt(6, 20));
    for (const userId of pickN(pool, attendeeCount)) {
      links.push({ userId, eventId: ev.id });
    }
  }
  return links;
}

// ---------------------------------------------------------------------
// 2. Load into CognoDB
// ---------------------------------------------------------------------

async function loadGraph() {
  const status = await checkConnection();
  if (!status.ok) {
    console.error('Could not connect to CognoDB:', status.message);
    console.error('Check COGNODB_URI / COGNODB_PASSWORD in your .env file.');
    process.exit(1);
  }

  const driver = getDriver();
  const session = driver.session();

  try {
    console.log('Wiping existing graph...');
    await session.executeWrite((tx) => tx.run('MATCH (n) DETACH DELETE n'));

    console.log('Creating constraints...');
    const constraints = [
      'CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
      'CREATE CONSTRAINT interest_id IF NOT EXISTS FOR (i:Interest) REQUIRE i.id IS UNIQUE',
      'CREATE CONSTRAINT group_id IF NOT EXISTS FOR (g:Group) REQUIRE g.id IS UNIQUE',
      'CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE',
      'CREATE CONSTRAINT city_name IF NOT EXISTS FOR (c:City) REQUIRE c.name IS UNIQUE',
    ];
    for (const c of constraints) {
      await session.executeWrite((tx) => tx.run(c));
    }

    const users = buildUsers();
    const interests = buildInterests();
    const userInterests = buildUserInterests(users, interests);
    const friendships = buildFriendships(users, userInterests);
    const groups = buildGroups(interests);
    const memberships = buildMemberships(users, userInterests, groups);
    const events = buildEvents(groups);
    const attendance = buildAttendance(memberships, events);

    console.log(`Loading ${CITIES.length} cities...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $cities AS name
         MERGE (:City {name: name})`,
        { cities: CITIES }
      )
    );

    console.log(`Loading ${interests.length} interests...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         CREATE (:Interest {id: row.id, name: row.name, category: row.category})`,
        { rows: interests }
      )
    );

    console.log(`Loading ${users.length} users + LIVES_IN...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         CREATE (u:User {id: row.id, name: row.name, age: row.age, bio: row.bio, avatarColor: row.avatarColor})
         WITH u, row
         MATCH (c:City {name: row.city})
         CREATE (u)-[:LIVES_IN]->(c)`,
        { rows: users }
      )
    );

    console.log(`Loading ${userInterests.length} INTERESTED_IN links...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         MATCH (u:User {id: row.userId}), (i:Interest {id: row.interestId})
         CREATE (u)-[:INTERESTED_IN {strength: row.strength}]->(i)`,
        { rows: userInterests }
      )
    );

    console.log(`Loading ${friendships.length} FRIENDS_WITH links...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         MATCH (a:User {id: row.a}), (b:User {id: row.b})
         CREATE (a)-[:FRIENDS_WITH]->(b)
         CREATE (b)-[:FRIENDS_WITH]->(a)`,
        { rows: friendships }
      )
    );

    console.log(`Loading ${groups.length} groups + FOCUSES_ON...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         CREATE (g:Group {id: row.id, name: row.name, description: row.description})
         WITH g, row
         UNWIND row.focusInterestIds AS interestId
         MATCH (i:Interest {id: interestId})
         CREATE (g)-[:FOCUSES_ON]->(i)`,
        { rows: groups }
      )
    );

    console.log(`Loading ${memberships.length} MEMBER_OF links...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         MATCH (u:User {id: row.userId}), (g:Group {id: row.groupId})
         CREATE (u)-[:MEMBER_OF {since: row.since}]->(g)`,
        { rows: memberships }
      )
    );

    console.log(`Loading ${events.length} events + HOSTED_BY + RELATED_TO...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         CREATE (e:Event {id: row.id, name: row.name, date: row.date, location: row.location})
         WITH e, row
         MATCH (g:Group {id: row.groupId})
         CREATE (e)-[:HOSTED_BY]->(g)
         WITH e, row
         UNWIND row.relatedInterestIds AS interestId
         MATCH (i:Interest {id: interestId})
         CREATE (e)-[:RELATED_TO]->(i)`,
        { rows: events }
      )
    );

    console.log(`Loading ${attendance.length} ATTENDED links...`);
    await session.executeWrite((tx) =>
      tx.run(
        `UNWIND $rows AS row
         MATCH (u:User {id: row.userId}), (e:Event {id: row.eventId})
         CREATE (u)-[:ATTENDED]->(e)`,
        { rows: attendance }
      )
    );

    console.log('\nSeed complete:');
    console.log(`  ${users.length} users, ${interests.length} interests, ${groups.length} groups, ${events.length} events`);
    console.log(`  ${friendships.length} friendships, ${userInterests.length} interest links, ${memberships.length} memberships, ${attendance.length} attendance records`);
  } finally {
    await session.close();
    await close();
  }
}

loadGraph().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
