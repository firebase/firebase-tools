import * as args from "../deploy/functions/args";
import * as backend from "../deploy/functions/backend";
import { Command } from "../command";
import { Options } from "../options";
import {needProjectId, needProjectNumber} from "../projectUtils";
import { pruneSecrets } from "../functions/secrets";
import {requirePermissions} from "../requirePermissions";

export default new Command("functions:secrets:prune")
  .description("Destroys unused secrets")
  .before(requirePermissions, ["cloudfunctions.functions.list"])
  .action(async (options: Options) => {
    needProjectNumber(options);
    const projectId = needProjectId(options);

    const haveBackend = await backend.existingBackend({ projectId } as args.Context);
    await pruneSecrets(options, backend.allEndpoints(haveBackend));
  });
