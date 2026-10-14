import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import * as secretManager from "../gcp/secretManager";
import * as secrets from "../functions/secrets";

export const command = new Command("functions:secrets:describe <KEY>")
  .description(
    "get metadata for secret and its versions. Alias for functions:secrets:get to align with gcloud",
  )
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.secrets.get"])
  .action(secrets.describeSecret);
