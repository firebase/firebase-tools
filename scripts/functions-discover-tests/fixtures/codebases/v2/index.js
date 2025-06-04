import { onRequest } from "firebase-functions/v2/https";

export const hellov2 = onRequest((request, response) => {
  response.send("Hello from Firebase!");
});
