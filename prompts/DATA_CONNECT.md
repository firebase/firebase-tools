# Firebase Data Connect Context
#
# For more information, see the official documentation:
# https://firebase.google.com/docs/dataconnect

Data Connect is a service that provides a type-safe, automatically-generated GraphQL API for a fully-managed PostgreSQL database.

## Schema Definition (`dataconnect.schema.gql`)

Define your data models using GraphQL SDL. The `@table` directive maps a type to a PostgreSQL table.
Primary keys are defined using the `key` argument of the `@table` directive. You can auto-generate primary key values using `@default(expr: "uuidV4()")`.

<example>
```graphql
"""
A user of the application.
"""
type User @table(key: "uid") {
  uid: String! @default(expr: "uuidV4()")
  displayName: String
  email: String
  photoURL: String
  createdAt: Timestamp! @default(expr: "now()")
  posts: [Post] @relation(field: "authorId")
}

"""
A post created by a user.
"""
type Post @table(key: "postId") {
  postId: String! @default(expr: "uuidV4()")
  authorId: String!
  title: String!
  content: String!
  publishedAt: Timestamp
  author: User @relation(on: "authorId", references: "uid")
}
```
</example>

## Queries and Mutations

Data Connect automatically generates a standard set of queries and mutations for each type in your schema. You do not need to define them manually. These include `_insert`, `_update`, `_delete`, and `_upsert` mutations, as well as queries to fetch single records or lists.

For more complex operations, you can define custom queries and mutations and implement their logic in connectors.

<example>
```graphql
# Data Connect automatically generates the following (and more):
#
# query User(key: User_Key!): User
# query Post(key: Post_Key!): Post
# mutation User_insert(value: User_InsertInput!): User_Key
# mutation Post_update(key: Post_Key!, value: Post_UpdateInput!): Post_Key
#
# You can also define your own custom queries and mutations.

query listUserPosts(uid: String!): [Post] @auth(level: USER, uid: "#uid")

mutation publishPost(postId: String!): Post @auth(level: USER)
```
</example>

## Connector Logic (`connectors/*.ts`)

Implement custom business logic for your queries and mutations in TypeScript. Data Connect handles the direct database interaction based on your schema, while connectors allow you to add validation, set default values, call other services, or perform other side effects.

<example>
```typescript
// src/connectors/posts.ts

import {
  publishPost as publishPostConnector,
  listUserPosts as listUserPostsConnector,
  FdcRequest,
} from "firebase-dataconnect";
import {logger} from "firebase-functions/v2";

// The Data Connect SDK is generated based on your dataconnect.schema.gql
import { PublishPostArgs, ListUserPostsArgs } from "dataconnect-sdk";

// Example of a connector with custom logic for publishing a post.
export const publishPost = publishPostConnector({
  input: PublishPostArgs,
}, async (req: FdcRequest<PublishPostArgs>) => {
  const { uid } = req.auth;
  const { postId } = req.input;

  // Your business logic here. For example, ensuring the user owns the post.
  // const canPublish = await verifyUserOwnsPost(uid, postId);
  // if (!canPublish) {
  //   throw new Error("Permission denied to publish this post.");
  // }

  logger.info(`Publishing post ${postId}`, { author: uid });

  // Return the data for the update. Data Connect will handle the database write.
  return {
    publishedAt: new Date(),
  };
});

// Example of a connector for listing a user's posts.
export const listUserPosts = listUserPostsConnector(async (req: FdcRequest<ListUserPostsArgs>) => {
  const { uid } = req.params;
  // Data Connect will automatically filter posts by authorId based on the
  // @relation directive in the schema. You can add further logic here if needed.
  logger.info(`Listing posts for user ${uid}`);
  return {}; // Return an empty object to let Data Connect handle the query.
});
```
</example>

## Development Commands

<example>
```bash
# Initialize Data Connect in a Firebase project
firebase init dataconnect

# Start the local Data Connect emulator
firebase emulators:start --only dataconnect

# Generate the Data Connect SDK
firebase dataconnect:sdk:generate

# Deploy Data Connect schema, connectors, and permissions
firebase deploy --only dataconnect

# Deploy a specific connector
firebase deploy --only dataconnect:my-connector

# View logs for Data Connect
firebase functions:log --only dataconnect
```
</example>
