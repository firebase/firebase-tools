# Operations Reference

## Contents
- [Generated Fields](#generated-fields)
- [Queries](#queries)
- [Mutations](#mutations)
- [Key Scalars](#key-scalars)
- [Multi-Step Operations](#multi-step-operations)

---

## Generated Fields

Data Connect auto-generates fields for each `@table` type:

| Generated Field | Purpose | Example |
|-----------------|---------|---------|
| `movie(id: UUID!)` | Get single record by ID | `movie(id: $id) { title }` |
| `movie(key: Movie_Key!)` | Get by key scalar | `movie(key: $key) { title }` |
| `movies(...)` | List/filter records | `movies(where: {...}) { ... }` |
| `movie_insert(data: ...)` | Create record | Returns key |
| `movie_insertMany(data: [...])` | Bulk create | Returns keys |
| `movie_update(id: ..., data: ...)` | Update by ID | Returns key or null |
| `movie_updateMany(where: ..., data: ...)` | Bulk update | Returns count |
| `movie_upsert(data: ...)` | Insert or update | Returns key |
| `movie_delete(id: ...)` | Delete by ID | Returns key or null |
| `movie_deleteMany(where: ...)` | Bulk delete | Returns count |

### Relation Fields
For a `Post` with `author: User!`:
- `post.author` - Navigate to related User
- `user.posts_on_author` - Reverse: all Posts by User

For many-to-many via `MovieActor`:
- `movie.actors_via_MovieActor` - Get all actors
- `actor.movies_via_MovieActor` - Get all movies

---

## Queries

### Basic Query

```graphql
query GetMovie($id: UUID!) @auth(level: PUBLIC) {
  movie(id: $id) {
    id title genre releaseYear
  }
}
```

### List with Filtering

```graphql
query ListMovies($genre: String, $minRating: Int) @auth(level: PUBLIC) {
  movies(
    where: {
      genre: { eq: $genre },
      rating: { ge: $minRating }
    },
    orderBy: [{ releaseYear: DESC }, { title: ASC }],
    limit: 20,
    offset: 0
  ) {
    id title genre rating
  }
}
```

### Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{ title: { eq: "Matrix" }}` |
| `ne` | Not equals | `{ status: { ne: "deleted" }}` |
| `gt`, `ge` | Greater than (or equal) | `{ rating: { ge: 4 }}` |
| `lt`, `le` | Less than (or equal) | `{ releaseYear: { lt: 2000 }}` |
| `in` | In list | `{ genre: { in: ["Action", "Drama"] }}` |
| `nin` | Not in list | `{ status: { nin: ["deleted", "hidden"] }}` |
| `isNull` | Is null check | `{ description: { isNull: true }}` |
| `contains` | String contains | `{ title: { contains: "war" }}` |
| `startsWith` | String starts with | `{ title: { startsWith: "The" }}` |
| `endsWith` | String ends with | `{ email: { endsWith: "@gmail.com" }}` |
| `includes` | Array includes | `{ tags: { includes: "sci-fi" }}` |

### Expression Operators (Compare with Server Values)

Use `_expr` suffix to compare with server-side values:

```graphql
query MyPosts @auth(level: USER) {
  posts(where: { authorUid: { eq_expr: "auth.uid" }}) {
    id title
  }
}

query RecentPosts @auth(level: PUBLIC) {
  posts(where: { publishedAt: { lt_expr: "request.time" }}) {
    id title
  }
}
```

### Logical Operators

```graphql
query ComplexFilter($genre: String, $minRating: Int) @auth(level: PUBLIC) {
  movies(where: {
    _or: [
      { genre: { eq: $genre }},
      { rating: { ge: $minRating }}
    ],
    _and: [
      { releaseYear: { ge: 2000 }},
      { status: { ne: "hidden" }}
    ],
    _not: { genre: { eq: "Horror" }}
  }) { id title }
}
```

### Relational Queries

```graphql
# Navigate relationships
query MovieWithDetails($id: UUID!) @auth(level: PUBLIC) {
  movie(id: $id) {
    title
    # One-to-one
    metadata: movieMetadata_on_movie { director }
    # One-to-many
    reviews: reviews_on_movie { rating user { name }}
    # Many-to-many
    actors: actors_via_MovieActor { name }
  }
}

# Filter by related data
query MoviesByDirector($director: String!) @auth(level: PUBLIC) {
  movies(where: {
    movieMetadata_on_movie: { director: { eq: $director }}
  }) { id title }
}
```

### Aliases

```graphql
query CompareRatings($genre: String!) @auth(level: PUBLIC) {
  highRated: movies(where: { genre: { eq: $genre }, rating: { ge: 8 }}) {
    title rating
  }
  lowRated: movies(where: { genre: { eq: $genre }, rating: { lt: 5 }}) {
    title rating
  }
}
```

---

## Mutations

### Create

```graphql
mutation CreateMovie($title: String!, $genre: String) @auth(level: USER) {
  movie_insert(data: {
    title: $title,
    genre: $genre
  })
}
```

### Create with Server Values

```graphql
mutation CreatePost($title: String!, $content: String!) @auth(level: USER) {
  post_insert(data: {
    authorUid_expr: "auth.uid",         # Current user
    id_expr: "uuidV4()",                 # Auto-generate UUID
    createdAt_expr: "request.time",      # Server timestamp
    title: $title,
    content: $content
  })
}
```

### Update

```graphql
mutation UpdateMovie($id: UUID!, $title: String, $genre: String) @auth(level: USER) {
  movie_update(
    id: $id,
    data: {
      title: $title,
      genre: $genre,
      updatedAt_expr: "request.time"
    }
  )
}
```

### Update Operators

```graphql
mutation IncrementViews($id: UUID!) @auth(level: PUBLIC) {
  movie_update(id: $id, data: {
    viewCount_update: { inc: 1 }
  })
}

mutation AddTag($id: UUID!, $tag: String!) @auth(level: USER) {
  movie_update(id: $id, data: {
    tags_update: { add: [$tag] }  # add, remove, append, prepend
  })
}
```

| Operator | Types | Description |
|----------|-------|-------------|
| `inc` | Int, Float, Date, Timestamp | Increment value |
| `dec` | Int, Float, Date, Timestamp | Decrement value |
| `add` | Lists | Add items if not present |
| `remove` | Lists | Remove all matching items |
| `append` | Lists | Append to end |
| `prepend` | Lists | Prepend to start |

### Upsert

```graphql
mutation UpsertUser($email: String!, $name: String!) @auth(level: USER) {
  user_upsert(data: {
    uid_expr: "auth.uid",
    email: $email,
    name: $name
  })
}
```

### Delete

```graphql
mutation DeleteMovie($id: UUID!) @auth(level: USER) {
  movie_delete(id: $id)
}

mutation DeleteOldDrafts @auth(level: USER) {
  post_deleteMany(where: {
    status: { eq: "draft" },
    createdAt: { lt_time: { now: true, sub: { days: 30 }}}
  })
}
```

### Filtered Updates/Deletes (User-Owned)

```graphql
mutation UpdateMyPost($id: UUID!, $content: String!) @auth(level: USER) {
  post_update(
    first: { where: {
      id: { eq: $id },
      authorUid: { eq_expr: "auth.uid" }  # Only own posts
    }},
    data: { content: $content }
  )
}
```

---

## Key Scalars

Key scalars (`Movie_Key`, `User_Key`) are auto-generated types representing primary keys:

```graphql
# Using key scalar
query GetMovie($key: Movie_Key!) @auth(level: PUBLIC) {
  movie(key: $key) { title }
}

# Variable format
# { "key": { "id": "uuid-here" } }

# Composite key
# { "key": { "movieId": "...", "userId": "..." } }
```

Key scalars are returned by mutations:

```graphql
mutation CreateAndFetch($title: String!) @auth(level: USER) {
  key: movie_insert(data: { title: $title })
  # Returns: { "key": { "id": "generated-uuid" } }
}
```

---

## Multi-Step Operations

### @transaction

Ensures atomicity - all steps succeed or all rollback:

```graphql
mutation CreateUserWithProfile($name: String!, $bio: String!) 
  @auth(level: USER) 
  @transaction {
  # Step 1: Create user
  user_insert(data: {
    uid_expr: "auth.uid",
    name: $name
  })
  # Step 2: Create profile (uses response from step 1)
  userProfile_insert(data: {
    userId_expr: "response.user_insert.uid",
    bio: $bio
  })
}
```

### Using response Binding

Access results from previous steps:

```graphql
mutation CreateTodoWithItem($listName: String!, $itemText: String!) 
  @auth(level: USER) 
  @transaction {
  todoList_insert(data: {
    id_expr: "uuidV4()",
    name: $listName
  })
  todoItem_insert(data: {
    listId_expr: "response.todoList_insert.id",  # From previous step
    text: $itemText
  })
}
```

### Embedded Queries

Run queries within mutations for validation:

```graphql
mutation AddToPublicList($listId: UUID!, $item: String!)
  @auth(level: USER)
  @transaction {
  # Step 1: Verify list exists and is public
  query @redact {
    todoList(id: $listId) @check(expr: "this != null", message: "List not found") {
      isPublic @check(expr: "this == true", message: "List is not public")
    }
  }
  # Step 2: Add item
  todoItem_insert(data: { listId: $listId, text: $item })
}
```
