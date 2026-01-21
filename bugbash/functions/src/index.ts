import { FirebaseContext, GraphqlServerOptions, onGraphRequest } from 'firebase-functions/dataconnect/graphql';

const opts: GraphqlServerOptions = {
    schemaFilePath: "dataconnect/schema_resolver/schema.gql",
    region: "us-east4",
    resolvers: {
        query: {
            hello(parent: unknown, args: Record<string, unknown>, contextValue: FirebaseContext, info: unknown) {
                return `Hello ${args.name}!`;
            },
        },
    },
}
exports.resolver = onGraphRequest(opts);
