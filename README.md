# Circles

A social discovery app backed by [CognoDB](https://console.cognodb.com), a managed graph database. Instead of a flat friend list, Circles helps people find who and what to connect to next:

- **People you may know** — friends-of-friends you're not yet connected to, ranked by mutual friends and shared interests.
- **Groups your friends are in** that you're not.
- **Events worth checking out**, matched to your interests and what your friends are attending.
- **Path finder** — the shortest chain of friendships connecting any two people ("six degrees").

Built for the Wexa AI CognoDB take-home assignment.

---

## Why a graph database?

Circles is fundamentally about *relationships between relationships* — friends of friends, groups your friends belong to, interests two people have in common — not rows that happen to reference each other by foreign key. A few concrete reasons a graph model earns its place here over a relational schema:

- **Variable-depth traversals are first-class.** "Who are my friends' friends that I'm not already connected to?" is a 2-hop pattern match in Cypher: `(me)-[:FRIENDS_WITH]->()-[:FRIENDS_WITH]->(candidate)`. The same query in SQL needs a self-join per hop, and the moment you want "up to N hops" (as the path finder does) SQL needs a recursive CTE that gets slower and uglier the deeper it goes. In Cypher, `shortestPath((a)-[:FRIENDS_WITH*..6]-(b))` is one line regardless of depth.
- **Relationships carry meaning and get queried directly.** `INTERESTED_IN`, `MEMBER_OF`, `FOCUSES_ON`, `ATTENDED` are typed, first-class edges, not join tables you have to remember to join correctly. Ranking recommendations by "count of shared relationship types" falls out naturally from pattern matching.
- **The interesting questions are about connectivity, not aggregation.** None of the core features here are "sum this column grouped by that column" — they're "what's reachable from this node, through which relationship types, within how many hops." That's the graph database's home turf.
- **The schema grows by adding relationship types, not migrations.** Adding "co-attended an event" as a recommendation signal is a new MATCH clause, not a new join table and foreign key migration.

Where a relational database would still be fine (e.g. storing a user's raw profile fields) we still use node properties for that — the graph model isn't forced onto data that doesn't need it.

---

## Data model

```
                (INTERESTED_IN)
   (User) ───────────────────────▶ (Interest)
     │  │                              ▲
     │  │(LIVES_IN)                    │(FOCUSES_ON)
     │  ▼                              │
     │ (City)                       (Group)
     │                                 ▲  ▲
     │(FRIENDS_WITH, undirected)       │  │(HOSTED_BY)
     │◀────────────────────┐    (MEMBER_OF) │
     └──────────────────────┘        │    (Event)
                                      │       │
                                      └───────┘
                                  (User)-[:ATTENDED]->(Event)
                                  (Event)-[:RELATED_TO]->(Interest)
```

**Nodes**

| Label | Key properties |
|---|---|
| `User` | `id`, `name`, `age`, `bio`, `avatarColor` |
| `Interest` | `id`, `name`, `category` |
| `Group` | `id`, `name`, `description` |
| `Event` | `id`, `name`, `date`, `location` |
| `City` | `name` |

**Relationships**

| Relationship | Direction | Meaning |
|---|---|---|
| `(:User)-[:FRIENDS_WITH]->(:User)` | stored both ways | mutual friendship |
| `(:User)-[:INTERESTED_IN {strength}]->(:Interest)` | User → Interest | a person's interests |
| `(:User)-[:LIVES_IN]->(:City)` | User → City | home city |
| `(:User)-[:MEMBER_OF {since}]->(:Group)` | User → Group | community membership |
| `(:Group)-[:FOCUSES_ON]->(:Interest)` | Group → Interest | what a group is about |
| `(:User)-[:ATTENDED]->(:Event)` | User → Event | event attendance |
| `(:Event)-[:HOSTED_BY]->(:Group)` | Event → Group | which group runs it |
| `(:Event)-[:RELATED_TO]->(:Interest)` | Event → Interest | what the event is about |

---

## Project structure

```
circles/
├── server/
│   ├── index.js          # Express app, static file serving, error handling
│   ├── db.js              # CognoDB (Neo4j driver) connection + query helpers
│   └── routes/
│       ├── users.js       # search, profile, friends, recommendations
│       ├── groups.js      # group list + detail
│       ├── events.js      # event list
│       └── path.js        # shortest-path finder
├── scripts/
│   └── seed.js             # generates + loads synthetic seed data
├── public/                 # frontend (vanilla HTML/CSS/JS, no build step)
│   ├── index.html
│   ├── css/styles.css
│   └── js/{api,render,app}.js
├── .env.example
└── package.json
```

---

## Setup

### 1. Create your CognoDB instance

1. Go to [console.cognodb.com/signup](https://console.cognodb.com/signup) and create a free account (no credit card required).
2. From the console, create a free **c0** instance and pick a region. It provisions in under a minute.
3. Copy the connection URI (`bolt+s://<instance-id>.databases.cognodb.cloud`) and the generated password for user `cognodb` — **the password is shown once**, so save it immediately.

### 2. Configure the app

```bash
git clone <this-repo-url>
cd circles
cp .env.example .env
```

Edit `.env`:

```
COGNODB_URI=bolt+s://<instance-id>.databases.cognodb.cloud
COGNODB_USER=cognodb
COGNODB_PASSWORD=<your generated password>
PORT=3000
```

### 3. Install, seed, run

```bash
npm install
npm run seed     # wipes the instance and loads ~160 users, interests, groups, events
npm start        # serves the app at http://localhost:3000
```

If CognoDB is unreachable, the app still starts — API routes return `503` with a clear error, and the frontend shows a "Database unreachable" indicator and empty/error states instead of breaking. This is deliberate: see `server/db.js` and `server/index.js`.

### 4. Deploy (optional but expected)

Any Node-friendly free host works (Render, Railway, Fly.io). Set the same three `COGNODB_*` environment variables in the host's dashboard — never commit `.env`. Build command: `npm install`. Start command: `npm start`.

---

## The main queries, explained

All queries live in `server/routes/*.js` and are parameterised — no string-concatenated Cypher anywhere.

**1. People you may know** (`GET /api/users/:id/recommendations/people`) — the core multi-hop query:

```cypher
MATCH (me:User {id: $id})-[:FRIENDS_WITH]->(mutual:User)-[:FRIENDS_WITH]->(candidate:User)
WHERE candidate <> me AND NOT (me)-[:FRIENDS_WITH]->(candidate)
WITH me, candidate, count(DISTINCT mutual) AS mutualFriends
OPTIONAL MATCH (me)-[:INTERESTED_IN]->(shared:Interest)<-[:INTERESTED_IN]-(candidate)
WITH me, candidate, mutualFriends, count(DISTINCT shared) AS sharedInterests
RETURN candidate.id AS id, mutualFriends, sharedInterests
ORDER BY (mutualFriends + sharedInterests) DESC
```

A 2-hop traversal (friend-of-friend), excluding existing friends, ranked by two independently-computed relationship counts. This is the query a relational schema handles worst: it's a self-join two levels deep with an anti-join and two separate aggregations.

**2. Path finder — six degrees** (`GET /api/path?from=&to=`):

```cypher
MATCH (a:User {id: $from}), (b:User {id: $to})
OPTIONAL MATCH p = shortestPath((a)-[:FRIENDS_WITH*..6]-(b))
RETURN p IS NOT NULL AS found, length(p) AS hops,
       [n IN nodes(p) | {id: n.id, name: n.name}] AS path
```

Variable-length pattern matching with no fixed hop count baked into the query — this has no clean SQL equivalent without a recursive CTE, and even then, "return the actual shortest path's node list" is awkward to express relationally.

**3. Group recommendations** (`GET /api/users/:id/recommendations/groups`) — groups your friends belong to that you don't, ranked by how many friends are in the group plus shared focus interests.

**4. Event recommendations** (`GET /api/users/:id/recommendations/events`) — events tagged with your interests, boosted if friends are attending.

---

## Screenshots

_Add screenshots of the running app here after deploying (Explore, a profile page, the recommendations page, and the path finder are the most representative)._ 

---

## Notes on the seed data

`scripts/seed.js` generates ~160 synthetic users, 28 interests across 8 categories, 18 interest-based groups, ~45-50 events, and friendships weighted toward shared-interest homophily (so recommendations reflect real clustering, not pure randomness) plus a smaller number of random long-range friendships so the graph stays connected without flattening every path to 1-2 hops. Running `npm run seed` again wipes and regenerates the whole graph — safe to re-run any time.
