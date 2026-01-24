/**
 * Import the onGraphRequest function trigger from its submodules:
 *
 * import {onGraphRequest} from "firebase-functions/v2/dataconnect/graphql";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {FirebaseContext,onGraphRequest} from "firebase-functions/dataconnect/graphql";

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
            hello(_parent: unknown, args: Record<string, unknown>, contextValue: FirebaseContext, _info: unknown) {
                return `Hello ${args.name}!`;
            },
        },
    },
}

exports.__resolverId__ = onGraphRequest(opts);
