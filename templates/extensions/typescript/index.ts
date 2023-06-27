/*
 * This template contains a HTTP function that responds
 * with a greeting when called
 *
 * Reference PARAMETERS in your functions code with:
 * `process.env.<parameter-name>`
 * Learn more about building extensions in the docs:
 * https://firebase.google.com/docs/extensions/publishers
 */

import * as functions from "firebase-functions";

exports.greetTheWorld = functions.https.onRequest(
  (req: functions.Request, res: functions.Response) => {
    // Here we reference a user-provided parameter
    // (its value is provided by the user during installation)
    const consumerProvidedGreeting = process.env.GREETING;

    // And here we reference an auto-populated parameter
    // (its value is provided by Firebase after installation)
    const instanceId = process.env.EXT_INSTANCE_ID;

    const greeting = `${consumerProvidedGreeting} World from ${instanceId}`;

    res.send(greeting);
  });
