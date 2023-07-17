module.exports = (() => {
  return {
    functionId: require("firebase-functions").https.onRequest((req, resp) => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resp.sendStatus(200);
          resolve();
        }, 3000);
      });
    }),
  };
})();
