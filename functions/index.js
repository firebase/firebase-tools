const functions = require("firebase-functions");

async function foo() {
  return Promise.resolve(true)
}

exports.log = functions.analytics.event("sign_up").onLog(async () => {
    await foo()
    return null;
});
// // Create and deploy your first functions
// // https://firebase.google.com/docs/functions/get-started
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
