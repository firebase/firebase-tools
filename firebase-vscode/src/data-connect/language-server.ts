
import { startServer } from "graphql-language-service-server";
import { NoUnusedVariablesInCheckDirective } from "./custom-validation-rules";

// The npm scripts are configured to only build this once before
// watching the extension, so please restart the extension debugger for changes!

async function start() {
  try {
    await startServer({
      method: "node",
      loadConfigOptions: { rootDir: ".firebase" },
      customValidationRules: [NoUnusedVariablesInCheckDirective],
    });
    // eslint-disable-next-line no-console
    console.log("Firebase GraphQL Language Server started!");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
}

void start();
