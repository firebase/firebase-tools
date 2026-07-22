const { onRequest } = require("firebase-functions/v2/https");

// Generate 20 functions for stress testing
for (let i = 1; i <= 20; i++) {
  exports[`stressFunction${i}`] = onRequest((request, response) => {
    response.send(`Hello from stress function ${i}!`);
  });
}
