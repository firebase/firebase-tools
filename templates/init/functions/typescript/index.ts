import { setGlobalOptions } from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { onRequest } from "firebase-functions/https";

// Start writing functions:
//   https://firebase.google.com/docs/functions/typescript

// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({
  // For cost control, you can set the maximum number of containers that can be
  // running at the same time. This helps mitigate the impact of unexpected
  // traffic spikes by instead downgrading performance. This limit is a
  // per-function limit. You can override the limit for each function using the
  // `maxInstances` option in the function's options, e.g.
  // `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
  maxInstances: 10,
  // Tip: event-driven triggers must run in the same region as the Firebase
  // services they listen to (Firestore, Storage, etc.).
  region: "us-central1",
});

export const helloWorld = onRequest((_request, response) => {
  logger.info("Hello from Firebase!", { structuredData: true });
  response.send("Hello from Firebase!");
});
