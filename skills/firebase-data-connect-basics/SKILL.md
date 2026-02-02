---
name: firebase-data-connect
description: Build and deploy Firebase Data Connect backends with PostgreSQL. Use for schema design, GraphQL queries/mutations, authorization, and SDK generation for web, Android, iOS, and Flutter apps.
---

# Firebase Data Connect

Firebase Data Connect is a relational database service using Cloud SQL for PostgreSQL with GraphQL schema, auto-generated queries/mutations, and type-safe SDKs.

## Quick Start

```graphql
# schema.gql - Define your data model
type Movie @table {
  id: UUID! @default(expr: "uuidV4()")
  title: String!
  releaseYear: Int
  genre: String
}

# queries.gql - Define operations
query ListMovies @auth(level: PUBLIC) {
  movies { id title genre }
}

mutation CreateMovie($title: String!, $genre: String) @auth(level: USER) {
  movie_insert(data: { title: $title, genre: $genre })
}
```

## Project Structure

```
dataconnect/
├── dataconnect.yaml      # Service configuration
├── schema/
│   └── schema.gql        # Data model (types with @table)
└── connector/
    ├── connector.yaml    # Connector config + SDK generation
    └── queries.gql       # Queries and mutations
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Schema** | GraphQL types with `@table` → PostgreSQL tables |
| **Connector** | Collection of queries/mutations as API endpoints |
| **Generated Fields** | Auto-generated `movie`, `movies`, `movie_insert`, `movie_update`, `movie_delete` |
| **Key Scalars** | `Movie_Key` type for record identification |
| **@auth** | Authorization directive: `PUBLIC`, `USER`, `USER_EMAIL_VERIFIED`, `NO_ACCESS` |

## Detailed References

**Design your data model** → See [schema.md](reference/schema.md)
- Types, @table, @col, @default directives
- Relationships with @ref (one-to-one, one-to-many, many-to-many)
- Data types: UUID, String, Int, Int64, Float, Boolean, Date, Timestamp, Vector

**Build queries and mutations** → See [operations.md](reference/operations.md)
- Generated fields and key scalars
- Filtering with `where`, `orderBy`, `limit`
- Relational queries with `_on_` and `_via_` syntax
- Multi-step mutations with `@transaction`

**Secure your operations** → See [security.md](reference/security.md)
- @auth directive and access levels
- CEL expressions for custom authorization
- @check and @redact for data lookup authorization
- Common authorization patterns and anti-patterns

**Integrate with client apps** → See [sdks.md](reference/sdks.md)
- Web, Android, iOS, Flutter SDK usage
- SDK generation with Firebase CLI
- Calling queries/mutations from client code

**Configure and deploy** → See [config.md](reference/config.md)
- dataconnect.yaml and connector.yaml structure
- Firebase CLI commands
- Local emulator setup
- Deployment workflow

**Advanced features** → See [advanced.md](reference/advanced.md)
- Vector similarity search with Vertex AI embeddings
- Full-text search with @searchable directive
- Cloud Functions integration (mutation triggers)
- Data seeding and bulk operations

## Common Patterns

### User-Owned Resources

```graphql
type Post @table {
  id: UUID! @default(expr: "uuidV4()")
  authorUid: String! @default(expr: "auth.uid")
  content: String!
}

mutation CreatePost($content: String!) @auth(level: USER) {
  post_insert(data: { authorUid_expr: "auth.uid", content: $content })
}

query MyPosts @auth(level: USER) {
  posts(where: { authorUid: { eq_expr: "auth.uid" }}) { id content }
}
```

### Many-to-Many Relationship

```graphql
type Movie @table {
  id: UUID! @default(expr: "uuidV4()")
  title: String!
}

type Actor @table {
  id: UUID! @default(expr: "uuidV4()")
  name: String!
}

type MovieActor @table(key: ["movie", "actor"]) {
  movie: Movie!
  actor: Actor!
  role: String!
}
```

### Filtered Queries

```graphql
query MoviesByGenre($genre: String!, $minRating: Int) @auth(level: PUBLIC) {
  movies(
    where: { genre: { eq: $genre }, rating: { ge: $minRating }},
    orderBy: [{ rating: DESC }],
    limit: 10
  ) { id title rating }
}
```

## Examples & Templates

**Complete working examples** → See [examples.md](examples.md)
**Ready-to-use templates** → See [templates.md](templates.md)

## MCP Tools Available

- `firebase_init` - Initialize Data Connect with `dataconnect` feature
- `firebase_get_sdk_config` - Get Firebase configuration for client apps
- `firebase_get_project` - Get current project information
- `firebase_update_environment` - Set project directory and active project

## CLI Commands

```bash
# Initialize Data Connect
firebase init dataconnect

# Start emulator for local development
firebase emulators:start --only dataconnect

# Generate SDKs
firebase dataconnect:sdk:generate

# Deploy to Firebase
firebase deploy --only dataconnect
```

## Key Directives Quick Reference

| Directive | Purpose | Example |
|-----------|---------|---------|
| `@table` | Define PostgreSQL table | `type Movie @table { ... }` |
| `@col` | Customize column name/type | `@col(name: "movie_id", dataType: "serial")` |
| `@default` | Set default value | `@default(expr: "uuidV4()")` |
| `@ref` | Foreign key reference | `author: User!` (implicit) or `@ref(fields: "authorId")` |
| `@unique` | Unique constraint | `email: String! @unique` |
| `@index` | Database index | `title: String! @index` |
| `@searchable` | Enable full-text search | `title: String! @searchable` |
| `@auth` | Authorization level | `@auth(level: USER)` or `@auth(expr: "auth.uid != nil")` |
| `@check` | Validate field in mutation | `@check(expr: "this != null", message: "Not found")` |
| `@redact` | Hide field from response | Used with @check for auth lookups |
| `@transaction` | Atomic multi-step mutation | `mutation Multi @transaction { ... }` |
