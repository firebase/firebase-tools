import { startServer } from "graphql-language-service-server";
// The npm scripts are configured to only build this once before
// watching the extension, so please restart the extension debugger for changes!

async function start() {
  try {
    await startServer({ method: "node", loadConfigOptions: {filepath: "./.firebase/dataconnect-graphqlrc.yaml"}});
    // eslint-disable-next-line no-console
    console.log("Firebase GraphQL Language Server started!");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

void start();
