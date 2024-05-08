import { startServer } from "graphql-language-service-server";
import { GraphQLConfig, loadConfig } from "graphql-config";
// The npm scripts are configured to only build this once before
// watching the extension, so please restart the extension debugger for changes!

async function start() {
    const schemaPaths = JSON.parse(process.env.schemaPaths);
    const documentPaths = JSON.parse(process.env.documentPaths);
    const graphqlConfig = new GraphQLConfig(
      {
        config: {
          schema: schemaPaths,
          documents: documentPaths,
        },
        filepath: ''
      },
      [],
    );
  const real = await loadConfig({filepath: ".graphqlrc"});
  console.log(graphqlConfig);
  console.log(graphqlConfig.getDefault());
  console.log(real);
  console.log(real.getDefault());
  try {
    await startServer({ method: "node", loadConfigOptions: {filepath: '.firebase/dataconnect/.graphqlrc'}, config: graphqlConfig });
    // eslint-disable-next-line no-console
    console.log("Firebase GraphQL Language Server started!");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

void start();
