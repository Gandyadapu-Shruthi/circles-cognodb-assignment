# Circles — Graph-Powered Social Discovery
Circles is a social discovery web application backed by **CognoDB**, a managed graph database compatible with the Neo4j JavaScript driver and openCypher.
The application models people, interests, groups, and events as a connected graph and uses graph traversals to provide recommendations, relationship discovery, and path finding.
# Live Demo
Hosted Application:https://circles-cognodb-assignment.vercel.app
GitHub Repository:https://github.com/Gandyadapu-Shruthi/circles-cognodb-assignment
# Features
Explore — Browse people and search profiles by name.
For You — Personalized recommendations based on friends, interests, and connected events.
Path Finder — Discover multi-hop connection paths between people.
Groups — Explore groups and their relationships.
Events — Explore events, interests, and group relationships.
Profiles — View individual user profiles and connected information.
Friendships — Create mutual friend relationships. 
Graph Visualization — Visualize the connected graph structure.
# Why a Graph Database?
Circles is fundamentally about relationships and connections,rather than isolated records.
A relational database could store users, friendships, interests, groups, and events in separate tables. However, queries involving multiple levels of relationships would require increasingly complex joins.
A graph database makes these relationships natural to query.
For example:
* Who are this person's friends?
* Who are their friends-of-friends?
* Which people share similar interests?
* Which events match a person's interests?
* Which events are attended by their friends?
* What path connects two people?
* How many degrees of separation exist between two users?
These are graph traversal problems, which makes CognoDB a natural fit for this application.
# Graph Data Model
The main node types are:
* User
* Interest
* Group
* Event
The main relationships are:
* User -[:FRIENDS_WITH]-> User
* User -[:INTERESTED_IN]-> Interest
* User -[:MEMBER_OF]-> Group
* User -[:ATTENDED]-> Event
* Event -[:HOSTED_BY]-> Group
* Event -[:RELATED_TO]-> Interest
# Graph Overview
mermaid
graph LR
    U1[User] -->|FRIENDS_WITH| U2[User]
    U1 -->|INTERESTED_IN| I[Interest]
    U1 -->|MEMBER_OF| G[Group]
    U1 -->|ATTENDED| E[Event]
    E -->|HOSTED_BY| G
    E -->|RELATED_TO| I
The graph is centered around relationships so that recommendations and discovery can be generated through traversals instead of static lists.
# Architecture
text
                    ┌──────────────────┐
                    │     Browser      │
                    │   Web Interface  │
                    └────────┬─────────┘
                             │
                             │ HTTP
                             ▼
                    ┌──────────────────┐
                    │   Node.js /      │
                    │   Express API    │
                    └────────┬─────────┘
                             │
                             │ Neo4j Driver
                             │ openCypher / Bolt
                             ▼
                    ┌──────────────────┐
                    │    CognoDB       │
                    │  Graph Database  │
                    └──────────────────┘

The production application is hosted on Vercel.
# Technology Stack
| Layer           | Technology                       |
| --------------- | -------------------------------- |
| Frontend        | HTML, CSS, JavaScript            |
| Backend         | Node.js, Express.js              |
| Database        | CognoDB Cloud                    |
| Query Language  | openCypher                       |
| Database Driver | Official Neo4j JavaScript Driver |
| Hosting         | Vercel                           |
| Version Control | Git + GitHub                     |
# Project Structure
text
circles/
│
├── api/
│   └── index.js
│
├── public/
│   ├── index.html
│   ├── styles.css
│   └── ...
│
├── scripts/
│   └── seed.js
│
├── server/
│   ├── index.js
│   └── ...
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── vercel.json
└── README.md
# Getting Started
# 1. Clone the Repository

```bash
git clone https://github.com/Gandyadapu-Shruthi/circles-cognodb-assignment.git
cd circles-cognodb-assignment
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Create a CognoDB Instance

Create a free CognoDB Cloud instance.

You will need:

* CognoDB connection URI
* CognoDB username
* CognoDB password

The application uses the `cognodb` user and a Bolt connection URI.

## 4. Configure Environment Variables

Create a `.env` file based on `.env.example`.

```env
COGNODB_URI=bolt+s://<your-instance>.databases.cognodb.com
COGNODB_USER=cognodb
COGNODB_PASSWORD=<your-password>
PORT=3000
```

**Important:** Never commit `.env` to GitHub.

The repository intentionally contains `.env.example` instead of the actual credentials.

## 5. Seed the Database

Run:

```bash
npm run seed
```

This loads the application's realistic seed data into CognoDB.

## 6. Start the Application

```bash
npm start
```

Open:

```text
http://localhost:3000
```

---
# Main Graph Queries
# 1. Friend Relationships
Friendships are represented directly as graph relationships.
The application uses a parameterized Cypher query:
cypher
MATCH (a:User {id: $fromId}), (b:User {id: $toId})
MERGE (a)-[:FRIENDS_WITH]->(b)
MERGE (b)-[:FRIENDS_WITH]->(a)
Using `MERGE` makes the operation idempotent.
Parameters are passed separately rather than concatenating user input into the Cypher query.
# 2. Personalized Event Recommendations
The recommendation system combines:
text
User
 │
 ├── INTERESTED_IN ──> Interest
 │                       │
 │                       └── RELATED_TO ──> Event
 │
 └── FRIENDS_WITH ──> Friend
                         │
                         └── ATTENDED ──> Event

A simplified version of the query is:

cypher
MATCH (me:User {id: $id})-[:INTERESTED_IN]->(interest:Interest)
      <-[:RELATED_TO]-(e:Event)

WITH me, e, count(DISTINCT interest) AS interestMatch

OPTIONAL MATCH (me)-[:FRIENDS_WITH]->(friend:User)-[:ATTENDED]->(e)

WITH e, interestMatch, count(DISTINCT friend) AS friendsGoing

OPTIONAL MATCH (e)-[:HOSTED_BY]->(g:Group)

RETURN
    e.id AS id,
    e.name AS name,
    e.date AS date,
    e.location AS location,
    g.name AS groupName,
    interestMatch,
    friendsGoing

ORDER BY e.date ASC,
         (friendsGoing * 2 + interestMatch) DESC

LIMIT $limit
This query demonstrates how graph relationships can combine several signals to produce useful recommendations.
# Multi-Hop Graph Traversal
The For You and Path Finder features use graph traversal.
For example:

```text
Aisha
  │
  │ FRIENDS_WITH
  ▼
Sofia
  │
  │ FRIENDS_WITH
  ▼
Tessa
  │
  │ FRIENDS_WITH
  ▼
Amara
```
The application can therefore determine that Aisha and Amara are connected through multiple relationship hops.
This type of relationship traversal is one of the main reasons a graph database is useful for Circles.
# API Endpoints
# Health Check
http
GET /api/health
# Get User Friends
http
GET /api/users/:id/friends
Example:
http
GET /api/users/u1/friends
The friendship endpoint creates the relationship in both directions.
# Error Handling
The application handles database connectivity problems gracefully.
If CognoDB becomes unavailable, the API returns an appropriate error response instead of crashing the entire application.
The frontend also provides an error state when data cannot be retrieved.
# Security
Database credentials are stored using environment variables.
The following values are **never committed to GitHub**:
```text
COGNODB_URI
COGNODB_PASSWORD
```
The repository only contains:

```text
The production credentials are configured through Vercel environment variables.
# Explore
The Explore page allows users to browse and search people.
# For You
The For You page generates relationship-based recommendations.
# Path Finder
Path Finder displays the connection between users and the degrees of separation.
# Deployment
The application is deployed using Vercel.
text
GitHub
   │
   ▼
Vercel
   │
   ▼
Node.js / Express
   │
   ▼
CognoDB Cloud


#Production URL
https://circles-cognodb-assignment.vercel.app
Production environment variables are configured in Vercel rather than stored in the repository.
# What This Project Demonstrates
This project demonstrates:
* Graph data modeling
* CognoDB integration
* Neo4j JavaScript Driver usage
* Parameterized openCypher queries
* Multi-hop graph traversal
* Relationship-based recommendations
* Seed data generation
* REST API development
* Express.js backend architecture
* Frontend graph exploration
* Environment-based secret management
* Graceful database error handling
* Vercel deployment
# Author
Gandyadapu-Shruthi
GitHub:https://github.com/Gandyadapu-Shruthi


