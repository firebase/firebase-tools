import * as functions from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";

export const hellov1 = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

export const hellov2 = onRequest((request, response) => {
  response.send("Hello from Firebase!");
});
