import { onGraphRequest } from 'firebase-functions/dataconnect';

const opts = {
    schemaFilePath: "dataconnect/schema_resolver/schema.gql",
    region: "us-east4",
    resolvers: {
        query: {
            hello(parent, args, contextValue, info) {
                return `Hello ${args.name}!`;
            },
        },
    },
}
exports.resolver = onGraphRequest(opts);
