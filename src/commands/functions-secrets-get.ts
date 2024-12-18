import { requireAuth } from "../requireAuth.js";
import { Command } from "../command.js";
import { requirePermissions } from "../requirePermissions.js";
import * as secretManager from "../gcp/secretManager.js";
import * as secrets from "../functions/secrets.js";

export const command = new Command("functions:secrets:get <KEY>")
  .description("Get metadata for secret and its versions")
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.secrets.get"])
  .action(secrets.describeSecret);
