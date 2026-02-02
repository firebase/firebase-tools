# Schema Reference

## Contents
- [Defining Types](#defining-types)
- [Core Directives](#core-directives)
- [Relationships](#relationships)
- [Data Types](#data-types)
- [Enumerations](#enumerations)

---

## Defining Types

Types with `@table` map to PostgreSQL tables. Data Connect auto-generates an implicit `id: UUID!` primary key.

```graphql
type Movie @table {
  # id: UUID! is auto-added
  title: String!
  releaseYear: Int
  genre: String
}
```

### Customizing Tables

```graphql
type Movie @table(name: "movies", key: "id", singular: "movie", plural: "movies") {
  id: UUID! @col(name: "movie_id") @default(expr: "uuidV4()")
  title: String!
  releaseYear: Int @col(name: "release_year")
  genre: String @col(dataType: "varchar(20)")
}
```

### User Table with Auth

```graphql
type User @table(key: "uid") {
  uid: String! @default(expr: "auth.uid")
  email: String! @unique
  displayName: String @col(dataType: "varchar(100)")
  createdAt: Timestamp! @default(expr: "request.time")
}
```

---

## Core Directives

### @table
Defines a database table.

| Argument | Description |
|----------|-------------|
| `name` | PostgreSQL table name (snake_case default) |
| `key` | Primary key field(s), default `["id"]` |
| `singular` | Singular name for generated fields |
| `plural` | Plural name for generated fields |

### @col
Customizes column mapping.

| Argument | Description |
|----------|-------------|
| `name` | Column name in PostgreSQL |
| `dataType` | PostgreSQL type: `serial`, `varchar(n)`, `text`, etc. |
| `size` | Required for `Vector` type |

### @default
Sets default value for inserts.

| Argument | Description |
|----------|-------------|
| `value` | Literal value: `@default(value: "draft")` |
| `expr` | CEL expression: `@default(expr: "uuidV4()")`, `@default(expr: "auth.uid")`, `@default(expr: "request.time")` |
| `sql` | Raw SQL: `@default(sql: "now()")` |

**Common expressions:**
- `uuidV4()` - Generate UUID
- `auth.uid` - Current user's Firebase Auth UID
- `request.time` - Server timestamp

### @unique
Adds unique constraint.

```graphql
type User @table {
  email: String! @unique
}

# Composite unique
type Review @table @unique(fields: ["movie", "user"]) {
  movie: Movie!
  user: User!
  rating: Int
}
```

### @index
Creates database index for query performance.

```graphql
type Movie @table @index(fields: ["genre", "releaseYear"], order: [ASC, DESC]) {
  title: String! @index
  genre: String
  releaseYear: Int
}
```

| Argument | Description |
|----------|-------------|
| `fields` | Fields for composite index (on @table) |
| `order` | `[ASC]` or `[DESC]` for each field |
| `type` | `BTREE` (default), `GIN` (arrays), `HNSW`/`IVFFLAT` (vectors) |

### @searchable
Enables full-text search on String fields.

```graphql
type Post @table {
  title: String! @searchable
  body: String! @searchable(language: "english")
}

# Usage
query SearchPosts($q: String!) @auth(level: PUBLIC) {
  posts_search(query: $q) { id title body }
}
```

---

## Relationships

### One-to-Many (Implicit Foreign Key)

```graphql
type Post @table {
  id: UUID! @default(expr: "uuidV4()")
  author: User!  # Creates authorId foreign key
  title: String!
}

type User @table {
  id: UUID! @default(expr: "uuidV4()")
  name: String!
  # Auto-generated: posts_on_author: [Post!]!
}
```

### @ref Directive
Customizes foreign key reference.

```graphql
type Post @table {
  author: User! @ref(fields: "authorId", references: "id")
  authorId: UUID!  # Explicit FK field
}
```

| Argument | Description |
|----------|-------------|
| `fields` | Local FK field name(s) |
| `references` | Target field(s) in referenced table |
| `constraintName` | PostgreSQL constraint name |

**Cascade behavior:**
- Required reference (`User!`): CASCADE DELETE (post deleted when user deleted)
- Optional reference (`User`): SET NULL (authorId set to null when user deleted)

### One-to-One

Use `@unique` on the reference field:

```graphql
type User @table { id: UUID! name: String! }

type UserProfile @table {
  user: User! @unique  # One profile per user
  bio: String
  avatarUrl: String
}

# Query: user.userProfile_on_user
```

### Many-to-Many

Use a join table with composite primary key:

```graphql
type Movie @table { id: UUID! title: String! }
type Actor @table { id: UUID! name: String! }

type MovieActor @table(key: ["movie", "actor"]) {
  movie: Movie!
  actor: Actor!
  role: String!  # Extra data on relationship
}

# Generated fields:
# - movie.actors_via_MovieActor: [Actor!]!
# - actor.movies_via_MovieActor: [Movie!]!
# - movie.movieActors_on_movie: [MovieActor!]!
```

---

## Data Types

| GraphQL Type | PostgreSQL Default | Other PostgreSQL Types |
|--------------|-------------------|----------------------|
| `String` | `text` | `varchar(n)`, `char(n)` |
| `Int` | `int4` | `int2`, `serial` |
| `Int64` | `bigint` | `bigserial`, `numeric` |
| `Float` | `float8` | `float4`, `numeric` |
| `Boolean` | `boolean` | |
| `UUID` | `uuid` | |
| `Date` | `date` | |
| `Timestamp` | `timestamptz` | Stored as UTC |
| `Any` | `jsonb` | |
| `Vector` | `vector` | Requires `@col(size: N)` |
| `[Type]` | Array | e.g., `[String]` → `text[]` |

---

## Enumerations

```graphql
enum Status {
  DRAFT
  PUBLISHED
  ARCHIVED
}

type Post @table {
  status: Status! @default(value: DRAFT)
  allowedStatuses: [Status!]
}
```

**Rules:**
- Enum names: PascalCase, no underscores
- Enum values: UPPER_SNAKE_CASE
- Values are ordered (for comparison operations)
- Changing order or removing values is a breaking change

---

## Views (Advanced)

Map custom SQL queries to GraphQL types:

```graphql
type MovieStats @view(sql: """
  SELECT
    movie_id,
    COUNT(*) as review_count,
    AVG(rating) as avg_rating
  FROM review
  GROUP BY movie_id
""") {
  movie: Movie @unique
  reviewCount: Int
  avgRating: Float
}

# Query movies with stats
query TopMovies @auth(level: PUBLIC) {
  movies(orderBy: [{ rating: DESC }]) {
    title
    stats: movieStats_on_movie {
      reviewCount avgRating
    }
  }
}
```
