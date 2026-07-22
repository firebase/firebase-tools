import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import * as secretManager from "../gcp/secretManager";
import * as secrets from "../functions/secrets";

export const command = new Command("functions:secrets:get <KEY>")
  .description("get metadata for secret and its versions")
  .before(requireAuth)
  .before(secretManager.ensureApi)
  .before(requirePermissions, ["secretmanager.secrets.get"])
  .action(secrets.describeSecret);
