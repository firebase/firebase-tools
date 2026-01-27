/**
 * Import the onGraphRequest function trigger from its submodules:
 *
 * const {onGraphRequest} = require("firebase-functions/v2/dataconnect/graphql");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onGraphRequest} = require("firebase-functions/dataconnect/graphql");

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

const opts = {
    schemaFilePath: "dataconnect/schema___resolverId__/schema.gql",
    resolvers: {
        query: {
            hello(_parent, args, _contextValue, _info) {
                return `Hello ${args.name}!`;
            },
        },
    },
}

exports.__resolverId__ = onGraphRequest(opts);
