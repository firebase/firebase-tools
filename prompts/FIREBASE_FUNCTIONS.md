# Firebase Functions Context (SDK 6.0.0+)

Always use v2 functions for new development. Use v1 only for Analytics, basic Auth, and Test Lab triggers.

For SDK versions before 6.0.0, add `/v2` to import paths (e.g., `firebase-functions/v2/https`).

## Function Imports (SDK 6.0.0+)

<example>
```typescript
// HTTPS functions
import {onRequest, onCall} from 'firebase-functions/https';

// Firestore triggers
import {onDocumentCreated, onDocumentUpdated, onDocumentDeleted} from 'firebase-functions/firestore';

// RTDB triggers
import {onValueCreated, onValueWritten, onValueUpdated, onValueDeleted} from 'firebase-functions/database';

// Scheduled functions
import {onSchedule} from 'firebase-functions/scheduler';

// Storage triggers
import {onObjectFinalized, onObjectDeleted} from 'firebase-functions/storage';

// Pub/Sub triggers
import {onMessagePublished} from 'firebase-functions/pubsub';

// Blocking Auth triggers
import {beforeUserCreated, beforeUserSignedIn} from 'firebase-functions/identity';

// Test Lab triggers
import {onTestMatrixCompleted} from 'firebase-functions/testLab';

// Deferred initialization
import {onInit} from 'firebase-functions';

// Structured logging
import {logger} from 'firebase-functions';

// Configuration
import {defineString, defineInt, defineSecret} from 'firebase-functions/params';
import * as params from 'firebase-functions/params';

// Note: For SDK versions before 6.0.0, add /v2 to import paths:
// import {onRequest} from 'firebase-functions/v2/https';

````
</example>

## v1 Functions (Analytics & Basic Auth Only)

<example>
```typescript
// Use v1 ONLY for these triggers
import * as functionsV1 from 'firebase-functions/v1';
import {logger} from 'firebase-functions';

// Analytics triggers (v1 only)
export const onPurchase = functionsV1.analytics.event('purchase').onLog((event) => {
  logger.info('Purchase event', {
    value: event.params?.value,
    currency: event.params?.currency
  });
});

// Basic Auth triggers (v1 only)
export const onUserCreate = functionsV1.auth.user().onCreate((user) => {
  logger.info('User created', { uid: user.uid, email: user.email });
  // Initialize user profile...
});

export const onUserDelete = functionsV1.auth.user().onDelete((user) => {
  logger.info('User deleted', { uid: user.uid });
  // Cleanup user data...
});
````

</example>

## Environment Configuration

<example>
```typescript
import {defineString, defineInt, defineSecret} from 'firebase-functions/params';
import * as params from 'firebase-functions/params';
import {onRequest} from 'firebase-functions/https';
import {logger} from 'firebase-functions';

// Built-in params available automatically
const projectId = params.projectID;
const databaseUrl = params.databaseURL;
const bucket = params.storageBucket;
const gcpProject = params.gcloudProject;

// Custom params
const apiUrl = defineString('API_URL', {
  default: 'https://api.example.com'
});

const environment = defineString('ENVIRONMENT', {
  default: 'dev'
});

const apiKey = defineSecret('STRIPE_KEY');

// Using params directly in runtime configuration
export const processPayment = onRequest({
  secrets: [apiKey],
  memory: defineString('PAYMENT_MEMORY', { default: '1GiB' }),
  minInstances: environment.equals('production').thenElse(5, 0),
  maxInstances: environment.equals('production').thenElse(1000, 10)
}, async (req, res) => {
  logger.info('Processing payment', {
    project: projectId.value(),
    bucket: bucket.value(),
    env: environment.value()
  });

  const key = apiKey.value();
  const url = apiUrl.value();
  // Process payment...
});

````
</example>

## Deferred Initialization

<example>
```typescript
import {onInit} from 'firebase-functions';
import {onRequest} from 'firebase-functions/https';

let heavyClient: HeavySDK;

onInit(async () => {
  const {HeavySDK} = await import('./lib/heavy-sdk');
  heavyClient = new HeavySDK({
    // Expensive initialization...
  });
});

export const useHeavyClient = onRequest(async (req, res) => {
  const result = await heavyClient.process(req.body);
  res.json(result);
});
````

</example>

## Structured Logging

<example>
```typescript
import {logger} from 'firebase-functions';
import {onRequest} from 'firebase-functions/https';

interface OrderRequest {
  orderId: string;
  userId: string;
  amount: number;
}

export const processOrder = onRequest(async (req, res) => {
  const {orderId, userId, amount} = req.body as OrderRequest;

  logger.info("Processing order", {
    orderId,
    userId,
    amount
  });

  try {
    // Process...
    logger.log("Order complete", { orderId });
    res.json({ success: true });
  } catch (error) {
    logger.error("Order failed", {
      orderId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({ error: "Processing failed" });
  }
});

````
</example>

## Development Commands

<example>
```bash
# TypeScript development
cd functions
npm install
npm run build        # Compile TypeScript

# Local development

firebase emulators:start --only functions

# Testing functions

npm test # Run unit tests
npm run serve # TypeScript watch + emulators

# Deployment

firebase deploy --only functions
firebase deploy --only functions:api,functions:onUserCreate

# Debugging

firebase functions:log
firebase functions:log --only api --lines=50

````

</example>
