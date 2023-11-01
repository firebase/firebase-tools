import { Command } from "../command";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as gcp from "../gcp/frameworks";
import { FirebaseError } from "../error";
import { logger } from "../logger";

export const command = new Command("backends:list")
  .description("List backends of a Firebase project.")
  .option("-l, --location <location>", "App Backend location", "us-central1")
  .action(async (options: Options) => {
    const projectId = needProjectId(options);
    const location = options.location as string;

    let backends;
    try {
      backends = await gcp.listBackend(projectId, location);
      /**
       * TODO print this in a prettier way.
       */
      logger.info(backends);
    } catch (err: any) {
      throw new FirebaseError(
        `Unable to list backends present in project: ${projectId}. Please check the parameters you have provided.`,
        { original: err }
      );
    }

    return backends;
  });
