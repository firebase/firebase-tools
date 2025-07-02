# Firebase Functions Context (SDK 6.0.0+)

Always use v2 functions for new development. Use v1 only for Analytics, basic Auth, and Test Lab triggers.

For SDK versions before 6.0.0, add `/v2` to import paths (e.g., `firebase-functions/v2/https`).

## Function Imports (SDK 6.0.0+ default paths)

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
import \* as params from 'firebase-functions/params';

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
import {onInit} from 'firebase-functions/core';
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

## Complete Mixed v1/v2 Module Example

<example>
```typescript
import {onRequest, onCall, HttpsError} from 'firebase-functions/https';
import {onDocumentCreated} from 'firebase-functions/firestore';
import {onSchedule} from 'firebase-functions/scheduler';
import {beforeUserCreated} from 'firebase-functions/identity';
import {defineSecret, defineString} from 'firebase-functions/params';
import * as params from 'firebase-functions/params';
import {logger} from 'firebase-functions';
import {onInit} from 'firebase-functions/core';
import * as admin from 'firebase-admin';

// v1 imports for Analytics and basic Auth only
import * as functionsV1 from 'firebase-functions/v1';
import {logger} from 'firebase-functions';

// Type definitions
interface EmailService {
  sendOrderConfirmation(email: string, order: any): Promise<void>;
}

// Initialize admin SDK
admin.initializeApp();

// Helper functions
async function processWebhook(data: any): Promise<any> {
  // Process webhook logic
  return { processed: true, timestamp: Date.now() };
}

// Configuration
const environment = defineString('ENVIRONMENT', { default: 'dev' });
const webhookUrl = defineString('WEBHOOK_URL');
const apiKey = defineSecret('API_KEY');

// Expensive initialization
let emailClient: EmailService;
onInit(async () => {
  const {EmailService} = await import('./lib/email');
  emailClient = new EmailService();
});

// Public API endpoint with dynamic configuration
export const webhook = onRequest({
  cors: true,
  maxInstances: environment.equals('production').thenElse(100, 10),
  memory: environment.equals('production').thenElse('2GiB', '512MiB'),
}, async (req, res) => {
  logger.info("Webhook received", {
    method: req.method,
    path: req.path,
    project: params.projectID.value()
  });

  const processed = await processWebhook(req.body);
  res.json({ processed });
});

// Blocking auth - runs before user creation
export const validateUser = beforeUserCreated(async (event) => {
  const user = event.data;
  if (user.email && !user.email.endsWith('@allowed.com')) {
    throw new HttpsError('invalid-argument', 'Invalid email domain');
  }
});

// v1: Basic auth trigger - runs after user creation
export const initializeUser = functionsV1.auth.user().onCreate(async (user) => {
  logger.info("Initializing user", { uid: user.uid });
  await admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    role: 'user'
  });
});

// v1: Analytics event
export const trackPurchase = functionsV1.analytics.event('in_app_purchase').onLog(async (event) => {
  logger.info("Purchase tracked", {
    user: event.user?.userId,
    value: event.params?.value,
    currency: event.params?.currency
  });
  // Store in Firestore for reporting
  await admin.firestore().collection('purchases').add({
    userId: event.user?.userId,
    value: event.params?.value,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
});

// Firestore trigger
export const onOrderCreate = onDocumentCreated({
  document: 'orders/{orderId}',
}, async (event) => {
  const order = event.data!.data();
  await emailClient.sendOrderConfirmation(order.email, order);
});

// Scheduled cleanup with conditional retry config
export const cleanup = onSchedule({
  schedule: 'every 24 hours',
  retryConfig: {
    retryCount: environment.equals('production').thenElse(5, 2)
  }
}, async () => {
  logger.info("Running cleanup", {
    database: params.databaseURL.value(),
    bucket: params.storageBucket.value()
  });
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
  // Cleanup old data...
});
````
</example>
