import { resource } from "../../resource";

export const migrate_runtime_config = resource(
  {
    uri: "firebase://guides/migrate/runtime_config",
    name: "firebase-functions-runtimeconfig-migration",
    title: "Migrate from runtime configuration",
    description: "Guide to migrate from functions.config API to Cloud Secret Manager",
  },
  async (uri, ctx) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
The \`functions.config\` API is deprecated will be decommissioned in March 2027.
**After that date, deployments with \`functions.config\` will fail.**

To prevent deployment failures, migrate your configuration to
Cloud Secret Manager using the Firebase CLI. This is strongly recommended as
the most efficient and secure way to migrate your configuration.

1. **Export configuration with the Firebase CLI**

   Use the \`config export\` command to export your existing environment config to a
   new secret in Cloud Secret Manager:

       $ ${ctx.firebaseCliCommand} functions:config:export
       i  This command retrieves your Runtime Config values (accessed via functions.config())
          and exports them as a Secret Manager secret.

       i  Fetching your existing functions.config() from your project...  ✔
          Fetched your existing functions.config().

       i  Configuration to be exported:
       ⚠  This may contain sensitive data. Do not share this output.

       {
          ...
       }

       ✔ What would you like to name the new secret for your configuration? RUNTIME_CONFIG

       ✔  Created new secret version projects/project/secrets/RUNTIME_CONFIG/versions/1

2. **Update function code to bind secrets**

   To use configuration stored in the new secret in Cloud Secret Manager, use the
   \`defineJsonSecret\` API in your function source. Also, make sure that secrets are
   bound to all functions that need them.

   **Before**

       const functions = require("firebase-functions/v1");

       exports.myFunction = functions.https.onRequest((req, res) => {
         const apiKey = functions.config().someapi.key;
         // ...
       });

   **After**

       const { onRequest } = require("firebase-functions/v2/https");
       const { defineJsonSecret } = require("firebase-functions/params");

       const config = defineJsonSecret("RUNTIME_CONFIG");

       exports.myFunction = onRequest(
         // Bind secret to your function
         { secrets: [config] },
         (req, res) => {
           // Access secret values via .value()
           const apiKey = config.value().someapi.key;
           // ...
       });

3. **Deploy Functions**

   Deploy your updated functions to apply the changes and bind the secret
   permissions.

       ${ctx.firebaseCliCommand} deploy --only functions:<your-function-name>
`.trim(),
        },
      ],
    };
  },
);
