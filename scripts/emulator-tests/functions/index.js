module.exports = (() => {
                    return {
                        functionId: require("firebase-functions")
                            .runWith({})
                            .https.onRequest(async () => {
                            return Promise.reject(new Error("not a thing"));
                        }),
                    };
                })();
