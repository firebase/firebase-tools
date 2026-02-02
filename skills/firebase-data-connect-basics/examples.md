# Examples

Complete, working examples for common Data Connect use cases.

---

## Movie Review App

A complete schema for a movie database with reviews, actors, and user authentication.

### Schema

```graphql
# schema.gql

# Users
type User @table(key: "uid") {
  uid: String! @default(expr: "auth.uid")
  email: String! @unique
  displayName: String
  createdAt: Timestamp! @default(expr: "request.time")
}

# Movies
type Movie @table {
  id: UUID! @default(expr: "uuidV4()")
  title: String!
  releaseYear: Int
  genre: String @index
  rating: Float
  description: String
  posterUrl: String
  createdAt: Timestamp! @default(expr: "request.time")
}

# Movie metadata (one-to-one)
type MovieMetadata @table {
  movie: Movie! @unique
  director: String
  runtime: Int
  budget: Int64
}

# Actors
type Actor @table {
  id: UUID! @default(expr: "uuidV4()")
  name: String!
  birthDate: Date
}

# Movie-Actor relationship (many-to-many)
type MovieActor @table(key: ["movie", "actor"]) {
  movie: Movie!
  actor: Actor!
  role: String!  # "lead" or "supporting"
  character: String
}

# Reviews (user-owned)
type Review @table @unique(fields: ["movie", "user"]) {
  id: UUID! @default(expr: "uuidV4()")
  movie: Movie!
  user: User!
  rating: Int!
  text: String
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### Queries

```graphql
# queries.gql

# Public: List movies with filtering
query ListMovies($genre: String, $minRating: Float, $limit: Int) 
  @auth(level: PUBLIC) {
  movies(
    where: {
      genre: { eq: $genre },
      rating: { ge: $minRating }
    },
    orderBy: [{ rating: DESC }],
    limit: $limit
  ) {
    id title genre rating releaseYear posterUrl
  }
}

# Public: Get movie with full details
query GetMovie($id: UUID!) @auth(level: PUBLIC) {
  movie(id: $id) {
    id title genre rating releaseYear description
    metadata: movieMetadata_on_movie { director runtime }
    actors: actors_via_MovieActor { name }
    reviews: reviews_on_movie(orderBy: [{ createdAt: DESC }], limit: 10) {
      rating text createdAt
      user { displayName }
    }
  }
}

# User: Get my reviews
query MyReviews @auth(level: USER) {
  reviews(where: { user: { uid: { eq_expr: "auth.uid" }}}) {
    id rating text createdAt
    movie { id title posterUrl }
  }
}
```

### Mutations

```graphql
# mutations.gql

# User: Create/update profile on first login
mutation UpsertUser($email: String!, $displayName: String) @auth(level: USER) {
  user_upsert(data: {
    uid_expr: "auth.uid",
    email: $email,
    displayName: $displayName
  })
}

# User: Add review (one per movie per user)
mutation AddReview($movieId: UUID!, $rating: Int!, $text: String) 
  @auth(level: USER) {
  review_upsert(data: {
    movie: { id: $movieId },
    user: { uid_expr: "auth.uid" },
    rating: $rating,
    text: $text
  })
}

# User: Delete my review
mutation DeleteReview($id: UUID!) @auth(level: USER) {
  review_delete(
    first: { where: {
      id: { eq: $id },
      user: { uid: { eq_expr: "auth.uid" }}
    }}
  )
}
```

---

## E-Commerce Store

Products, orders, and cart management with user authentication.

### Schema

```graphql
# schema.gql

type User @table(key: "uid") {
  uid: String! @default(expr: "auth.uid")
  email: String! @unique
  name: String
  shippingAddress: String
}

type Product @table {
  id: UUID! @default(expr: "uuidV4()")
  name: String! @index
  description: String
  price: Float!
  stock: Int! @default(value: 0)
  category: String @index
  imageUrl: String
}

type CartItem @table(key: ["user", "product"]) {
  user: User!
  product: Product!
  quantity: Int!
}

enum OrderStatus {
  PENDING
  PAID
  SHIPPED
  DELIVERED
  CANCELLED
}

type Order @table {
  id: UUID! @default(expr: "uuidV4()")
  user: User!
  status: OrderStatus! @default(value: PENDING)
  total: Float!
  shippingAddress: String!
  createdAt: Timestamp! @default(expr: "request.time")
}

type OrderItem @table {
  id: UUID! @default(expr: "uuidV4()")
  order: Order!
  product: Product!
  quantity: Int!
  priceAtPurchase: Float!
}
```

### Operations

```graphql
# Public: Browse products
query ListProducts($category: String, $search: String) @auth(level: PUBLIC) {
  products(where: {
    category: { eq: $category },
    name: { contains: $search },
    stock: { gt: 0 }
  }) {
    id name price stock imageUrl
  }
}

# User: View cart
query MyCart @auth(level: USER) {
  cartItems(where: { user: { uid: { eq_expr: "auth.uid" }}}) {
    quantity
    product { id name price imageUrl stock }
  }
}

# User: Add to cart
mutation AddToCart($productId: UUID!, $quantity: Int!) @auth(level: USER) {
  cartItem_upsert(data: {
    user: { uid_expr: "auth.uid" },
    product: { id: $productId },
    quantity: $quantity
  })
}

# User: Checkout (transactional)
mutation Checkout($shippingAddress: String!) 
  @auth(level: USER) 
  @transaction {
  # Query cart items
  query @redact {
    cartItems(where: { user: { uid: { eq_expr: "auth.uid" }}}) 
      @check(expr: "this.size() > 0", message: "Cart is empty") {
      quantity
      product { id price }
    }
  }
  # Create order (in real app, calculate total from cart)
  order_insert(data: {
    user: { uid_expr: "auth.uid" },
    shippingAddress: $shippingAddress,
    total: 0  # Calculate in app logic
  })
}
```

---

## Blog with Permissions

Multi-author blog with role-based permissions.

### Schema

```graphql
# schema.gql

type User @table(key: "uid") {
  uid: String! @default(expr: "auth.uid")
  email: String! @unique
  name: String!
  bio: String
}

enum UserRole {
  VIEWER
  AUTHOR
  EDITOR
  ADMIN
}

type BlogPermission @table(key: ["user"]) {
  user: User!
  role: UserRole! @default(value: VIEWER)
}

enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

type Post @table {
  id: UUID! @default(expr: "uuidV4()")
  author: User!
  title: String! @searchable
  content: String! @searchable
  status: PostStatus! @default(value: DRAFT)
  publishedAt: Timestamp
  createdAt: Timestamp! @default(expr: "request.time")
  updatedAt: Timestamp! @default(expr: "request.time")
}

type Comment @table {
  id: UUID! @default(expr: "uuidV4()")
  post: Post!
  author: User!
  content: String!
  createdAt: Timestamp! @default(expr: "request.time")
}
```

### Operations with Role Checks

```graphql
# Public: Read published posts
query PublishedPosts @auth(level: PUBLIC) {
  posts(
    where: { status: { eq: PUBLISHED }},
    orderBy: [{ publishedAt: DESC }]
  ) {
    id title content publishedAt
    author { name }
  }
}

# Author+: Create post
mutation CreatePost($title: String!, $content: String!) 
  @auth(level: USER) 
  @transaction {
  # Check user is at least AUTHOR
  query @redact {
    blogPermission(key: { user: { uid_expr: "auth.uid" }})
      @check(expr: "this != null", message: "No permission record") {
      role @check(expr: "this in ['AUTHOR', 'EDITOR', 'ADMIN']", message: "Must be author+")
    }
  }
  post_insert(data: {
    author: { uid_expr: "auth.uid" },
    title: $title,
    content: $content
  })
}

# Editor+: Publish any post
mutation PublishPost($id: UUID!) 
  @auth(level: USER) 
  @transaction {
  query @redact {
    blogPermission(key: { user: { uid_expr: "auth.uid" }}) {
      role @check(expr: "this in ['EDITOR', 'ADMIN']", message: "Must be editor+")
    }
  }
  post_update(id: $id, data: {
    status: PUBLISHED,
    publishedAt_expr: "request.time"
  })
}

# Admin: Grant role
mutation GrantRole($userUid: String!, $role: UserRole!) 
  @auth(level: USER) 
  @transaction {
  query @redact {
    blogPermission(key: { user: { uid_expr: "auth.uid" }}) {
      role @check(expr: "this == 'ADMIN'", message: "Must be admin")
    }
  }
  blogPermission_upsert(data: {
    user: { uid: $userUid },
    role: $role
  })
}
```
