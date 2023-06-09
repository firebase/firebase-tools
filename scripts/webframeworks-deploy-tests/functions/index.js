import { onRequest } from "firebase-functions/v2/https";

export const helloWorld = onRequest((request, response) => {
  response.send("Hello from Firebase!");
});
