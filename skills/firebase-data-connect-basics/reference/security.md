# Security Reference

## Contents
- [@auth Directive](#auth-directive)
- [Access Levels](#access-levels)
- [CEL Expressions](#cel-expressions)
- [@check and @redact](#check-and-redact)
- [Authorization Patterns](#authorization-patterns)
- [Anti-Patterns](#anti-patterns)

---

## @auth Directive

Every deployable query/mutation must have `@auth`. Without it, operations default to `NO_ACCESS`.

```graphql
query PublicData @auth(level: PUBLIC) { ... }
query UserData @auth(level: USER) { ... }
query AdminOnly @auth(expr: "auth.token.admin == true") { ... }
```

| Argument | Description |
|----------|-------------|
| `level` | Preset access level |
| `expr` | CEL expression (alternative to level) |
| `insecureReason` | Suppress deploy warning for PUBLIC/unfiltered USER |

---

## Access Levels

| Level | Who Can Access | CEL Equivalent |
|-------|----------------|----------------|
| `PUBLIC` | Anyone, authenticated or not | `true` |
| `USER_ANON` | Any authenticated user (including anonymous) | `auth.uid != nil` |
| `USER` | Authenticated users (excludes anonymous) | `auth.uid != nil && auth.token.firebase.sign_in_provider != 'anonymous'` |
| `USER_EMAIL_VERIFIED` | Users with verified email | `auth.uid != nil && auth.token.email_verified` |
| `NO_ACCESS` | Admin SDK only | `false` |

> **Important:** Levels like `USER` are starting points. Always add filters or expressions to verify the user can access specific data.

---

## CEL Expressions

### Available Bindings

| Binding | Description |
|---------|-------------|
| `auth.uid` | Current user's Firebase UID |
| `auth.token` | Auth token claims (see below) |
| `vars` | Operation variables (e.g., `vars.movieId`) |
| `request.time` | Server timestamp |
| `request.operationName` | "query" or "mutation" |

### auth.token Fields

| Field | Description |
|-------|-------------|
| `email` | User's email address |
| `email_verified` | Boolean: email verified |
| `phone_number` | User's phone |
| `name` | Display name |
| `sub` | Firebase UID (same as auth.uid) |
| `firebase.sign_in_provider` | `password`, `google.com`, `anonymous`, etc. |
| `<custom_claim>` | Custom claims set via Admin SDK |

### Expression Examples

```graphql
# Check custom claim
@auth(expr: "auth.token.role == 'admin'")

# Check verified email domain
@auth(expr: "auth.token.email_verified && auth.token.email.endsWith('@company.com')")

# Check multiple conditions
@auth(expr: "auth.uid != nil && (auth.token.role == 'editor' || auth.token.role == 'admin')")

# Check variable
@auth(expr: "has(vars.status) && vars.status in ['draft', 'published']")
```

### Using eq_expr in Filters

Compare database fields with auth values:

```graphql
query MyPosts @auth(level: USER) {
  posts(where: { authorUid: { eq_expr: "auth.uid" }}) {
    id title
  }
}

mutation UpdateMyPost($id: UUID!, $title: String!) @auth(level: USER) {
  post_update(
    first: { where: {
      id: { eq: $id },
      authorUid: { eq_expr: "auth.uid" }
    }},
    data: { title: $title }
  )
}
```

---

## @check and @redact

Use `@check` to validate data and `@redact` to hide results from client:

### @check
Validates a field value; aborts if check fails.

```graphql
@check(expr: "this != null", message: "Not found")
@check(expr: "this == 'editor'", message: "Must be editor")
@check(expr: "this.exists(p, p.role == 'admin')", message: "No admin found")
```

| Argument | Description |
|----------|-------------|
| `expr` | CEL expression; `this` = current field value |
| `message` | Error message if check fails |
| `optional` | If `true`, pass when field not present |

### @redact
Hides field from response (still evaluated for @check):

```graphql
query @redact { ... }  # Query result hidden but @check still runs
```

### Authorization Data Lookup

Check database permissions before allowing mutation:

```graphql
mutation UpdateMovie($id: UUID!, $title: String!) 
  @auth(level: USER) 
  @transaction {
  # Step 1: Check user has permission
  query @redact {
    moviePermission(
      key: { movieId: $id, userId_expr: "auth.uid" }
    ) @check(expr: "this != null", message: "No access to movie") {
      role @check(expr: "this == 'editor'", message: "Must be editor")
    }
  }
  # Step 2: Update if authorized
  movie_update(id: $id, data: { title: $title })
}
```

### Validate Key Exists

```graphql
mutation MustDeleteMovie($id: UUID!) @auth(level: USER) @transaction {
  movie_delete(id: $id) 
    @check(expr: "this != null", message: "Movie not found")
}
```

---

## Authorization Patterns

### User-Owned Resources

```graphql
# Create with owner
mutation CreatePost($content: String!) @auth(level: USER) {
  post_insert(data: {
    authorUid_expr: "auth.uid",
    content: $content
  })
}

# Read own data only
query MyPosts @auth(level: USER) {
  posts(where: { authorUid: { eq_expr: "auth.uid" }}) {
    id content
  }
}

# Update own data only
mutation UpdatePost($id: UUID!, $content: String!) @auth(level: USER) {
  post_update(
    first: { where: { id: { eq: $id }, authorUid: { eq_expr: "auth.uid" }}},
    data: { content: $content }
  )
}

# Delete own data only
mutation DeletePost($id: UUID!) @auth(level: USER) {
  post_delete(
    first: { where: { id: { eq: $id }, authorUid: { eq_expr: "auth.uid" }}}
  )
}
```

### Role-Based Access

```graphql
# Admin-only query
query AllUsers @auth(expr: "auth.token.admin == true") {
  users { id email name }
}

# Role from database
mutation AdminAction($id: UUID!) @auth(level: USER) @transaction {
  query @redact {
    user(key: { uid_expr: "auth.uid" }) {
      role @check(expr: "this == 'admin'", message: "Admin required")
    }
  }
  # ... admin action
}
```

### Public Data with Filters

```graphql
query PublicPosts @auth(level: PUBLIC) {
  posts(where: {
    visibility: { eq: "public" },
    publishedAt: { lt_expr: "request.time" }
  }) {
    id title content
  }
}
```

### Tiered Access (Pro Content)

```graphql
query ProContent @auth(expr: "auth.token.plan == 'pro'") {
  posts(where: { visibility: { in: ["public", "pro"] }}) {
    id title content
  }
}
```

---

## Anti-Patterns

### ❌ Don't Pass User ID as Variable

```graphql
# BAD - any user can pass any userId
query GetUserPosts($userId: String!) @auth(level: USER) {
  posts(where: { authorUid: { eq: $userId }}) { ... }
}

# GOOD - use auth.uid
query GetMyPosts @auth(level: USER) {
  posts(where: { authorUid: { eq_expr: "auth.uid" }}) { ... }
}
```

### ❌ Don't Use USER Without Filters

```graphql
# BAD - any authenticated user sees all documents
query AllDocs @auth(level: USER) {
  documents { id title content }
}

# GOOD - filter to user's documents
query MyDocs @auth(level: USER) {
  documents(where: { ownerId: { eq_expr: "auth.uid" }}) { ... }
}
```

### ❌ Don't Trust Unverified Email

```graphql
# BAD - email not verified
@auth(expr: "auth.token.email.endsWith('@company.com')")

# GOOD - verify email first
@auth(expr: "auth.token.email_verified && auth.token.email.endsWith('@company.com')")
```

### ❌ Don't Use PUBLIC/USER for Prototyping

During development, set operations to `NO_ACCESS` until you implement proper authorization. Use emulator and VS Code extension for testing.
