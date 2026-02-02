# Advanced Features Reference

## Contents
- [Vector Similarity Search](#vector-similarity-search)
- [Full-Text Search](#full-text-search)
- [Cloud Functions Integration](#cloud-functions-integration)
- [Data Seeding & Bulk Operations](#data-seeding--bulk-operations)

---

## Vector Similarity Search

Semantic search using Vertex AI embeddings and PostgreSQL's `pgvector`.

### Schema Setup

```graphql
type Movie @table {
  id: UUID! @default(expr: "uuidV4()")
  title: String!
  description: String
  # Vector field for embeddings - size must match model output (768 for gecko)
  descriptionEmbedding: Vector! @col(size: 768)
}
```

### Generate Embeddings in Mutations

Use `_embed` server value to auto-generate embeddings via Vertex AI:

```graphql
mutation CreateMovieWithEmbedding($title: String!, $description: String!) 
  @auth(level: USER) {
  movie_insert(data: {
    title: $title,
    description: $description,
    descriptionEmbedding_embed: {
      model: "textembedding-gecko@003",
      text: $description
    }
  })
}
```

### Similarity Search Query

Data Connect generates `_similarity` fields for Vector columns:

```graphql
query SearchMovies($query: String!) @auth(level: PUBLIC) {
  movies_descriptionEmbedding_similarity(
    compare_embed: { model: "textembedding-gecko@003", text: $query },
    method: L2,         # L2, COSINE, or INNER_PRODUCT
    within: 2.0,        # Max distance threshold
    limit: 5
  ) {
    id
    title
    description
    _metadata { distance }  # See how close each result is
  }
}
```

### Similarity Parameters

| Parameter | Description |
|-----------|-------------|
| `compare` | Raw Vector to compare against |
| `compare_embed` | Generate embedding from text via Vertex AI |
| `method` | Distance function: `L2`, `COSINE`, `INNER_PRODUCT` |
| `within` | Max distance (results further are excluded) |
| `where` | Additional filters |
| `limit` | Max results to return |

### Custom Embeddings

Pass pre-computed vectors directly:

```graphql
mutation StoreCustomEmbedding($id: UUID!, $embedding: Vector!) @auth(level: USER) {
  movie_update(id: $id, data: { descriptionEmbedding: $embedding })
}

query SearchWithCustomVector($vector: Vector!) @auth(level: PUBLIC) {
  movies_descriptionEmbedding_similarity(
    compare: $vector,
    method: COSINE,
    limit: 10
  ) { id title }
}
```

---

## Full-Text Search

Fast keyword/phrase search using PostgreSQL's full-text capabilities.

### Enable with @searchable

```graphql
type Movie @table {
  title: String! @searchable
  description: String @searchable(language: "english")
  genre: String @searchable
}
```

### Search Query

Data Connect generates `_search` fields:

```graphql
query SearchMovies($query: String!) @auth(level: PUBLIC) {
  movies_search(
    query: $query,
    queryFormat: QUERY,  # QUERY, PLAIN, PHRASE, or ADVANCED
    limit: 20
  ) {
    id title description
    _metadata { relevance }  # Relevance score
  }
}
```

### Query Formats

| Format | Description |
|--------|-------------|
| `QUERY` | Web-style (default): quotes, AND, OR supported |
| `PLAIN` | Match all words, any order |
| `PHRASE` | Match exact phrase |
| `ADVANCED` | Full tsquery syntax |

### Tuning Results

```graphql
query SearchWithThreshold($query: String!) @auth(level: PUBLIC) {
  movies_search(
    query: $query,
    relevanceThreshold: 0.05,  # Min relevance score
    where: { genre: { eq: "Action" }},
    orderBy: [{ releaseYear: DESC }]
  ) { id title }
}
```

### Supported Languages

`english` (default), `french`, `german`, `spanish`, `italian`, `portuguese`, `dutch`, `danish`, `finnish`, `norwegian`, `swedish`, `russian`, `arabic`, `hindi`, `simple`

---

## Cloud Functions Integration

Trigger Cloud Functions when mutations execute.

### Basic Trigger (Node.js)

```typescript
import { onMutationExecuted } from "firebase-functions/dataconnect";
import { logger } from "firebase-functions";

export const onUserCreate = onMutationExecuted(
  {
    service: "myService",
    connector: "default",
    operation: "CreateUser",
    region: "us-central1"  // Must match Data Connect location
  },
  (event) => {
    const variables = event.data.payload.variables;
    const returnedData = event.data.payload.data;
    
    logger.info("User created:", returnedData);
    // Send welcome email, sync to analytics, etc.
  }
);
```

### Basic Trigger (Python)

```python
from firebase_functions import dataconnect_fn, logger

@dataconnect_fn.on_mutation_executed(
  service="myService",
  connector="default",
  operation="CreateUser"
)
def on_user_create(event: dataconnect_fn.Event):
  variables = event.data.payload.variables
  returned_data = event.data.payload.data
  logger.info("User created:", returned_data)
```

### Event Data

```typescript
// event.authType: "app_user" | "unauthenticated" | "admin"
// event.authId: Firebase Auth UID (for app_user)
// event.data.payload.variables: mutation input variables
// event.data.payload.data: mutation response data
// event.data.payload.errors: any errors that occurred
```

### Filtering with Wildcards

```typescript
// Trigger on all User* mutations
export const onUserMutation = onMutationExecuted(
  { operation: "User*" },
  (event) => { /* ... */ }
);

// Capture operation name
export const onAnyMutation = onMutationExecuted(
  { service: "myService", operation: "{operationName}" },
  (event) => {
    console.log("Operation:", event.params.operationName);
  }
);
```

### Use Cases

- **Data sync**: Replicate to Firestore, BigQuery, external APIs
- **Notifications**: Send emails, push notifications on events
- **Async workflows**: Image processing, data aggregation
- **Audit logging**: Track all data changes

> ⚠️ **Avoid infinite loops**: Don't trigger mutations that would fire the same trigger. Use filters to exclude self-triggered events.

---

## Data Seeding & Bulk Operations

### Local Prototyping with _insertMany

```graphql
mutation SeedMovies @transaction {
  movie_insertMany(data: [
    { id: "uuid-1", title: "Movie 1", genre: "Action" },
    { id: "uuid-2", title: "Movie 2", genre: "Drama" },
    { id: "uuid-3", title: "Movie 3", genre: "Comedy" }
  ])
}
```

### Reset Data with _upsertMany

```graphql
mutation ResetData {
  movie_upsertMany(data: [
    { id: "uuid-1", title: "Movie 1", genre: "Action" },
    { id: "uuid-2", title: "Movie 2", genre: "Drama" }
  ])
}
```

### Clear All Data

```graphql
mutation ClearMovies {
  movie_deleteMany(all: true)
}
```

### Production: Admin SDK Bulk Operations

```typescript
import { initializeApp } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';

const app = initializeApp();
const dc = getDataConnect({ location: "us-central1", serviceId: "my-service" });

const movies = [
  { id: "uuid-1", title: "Movie 1", genre: "Action" },
  { id: "uuid-2", title: "Movie 2", genre: "Drama" }
];

// Bulk insert
await dc.insertMany("movie", movies);

// Bulk upsert
await dc.upsertMany("movie", movies);

// Single operations
await dc.insert("movie", movies[0]);
await dc.upsert("movie", movies[0]);
```

### Emulator Data Persistence

```bash
# Export emulator data
firebase emulators:export ./seed-data

# Start with saved data
firebase emulators:start --only dataconnect --import=./seed-data
```
