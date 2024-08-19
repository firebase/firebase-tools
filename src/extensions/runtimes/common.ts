// import { logLabeledWarning } from "../../utils";
import { Options } from "../../options";
import { normalizeAndValidate } from "../../functions/projectConfig";
import { loadCodebases } from "../../deploy/functions/prepare";
import { Build, DynamicExtension } from "../../deploy/functions/build";
import { getFirebaseConfig } from "../../functionsConfig";
import {
  EndpointFilter as Filter,
  targetCodebases,
} from "../../deploy/functions/functionsDeployHelper";
import { logger } from "../../logger";

export { DynamicExtension } from "../../deploy/functions/build";

const savedLoggerSilent = logger.silent;

function silenceLogging(): void {
  logger.silent = true;
}

function resumeLogging(): void {
  logger.silent = savedLoggerSilent;
}

/**
 * Looks in all functions codebases for extension definitions
 * @param options The options to use for getting the firebaseConfig
 * @return A list of all extensions defined in functions codebases by id
 */
export async function extractAllDynamicExtensions(
  options: Options,
): Promise<Record<string, DynamicExtension>> {
  // This looks for extensions in ALL functions codebases.
  // Because we can have a situation where we are deploying
  // from codebase A and also have extensions in codebase B. We don't want
  // to ask to delete extensions from codebase B in that case, so we
  // need to exclude those from the deletions.
  const firebaseConfig = await getFirebaseConfig(options);
  const runtimeConfig: Record<string, unknown> = { firebase: firebaseConfig };
  const functionsConfig = normalizeAndValidate(options.config.src.functions);

  // Try to load them separately so if one fails they don't all fail.
  // (Otherwise you could end up both installing and asking if you want to
  // delete the same extension).
  let functionsBuilds: Record<string, Build> = {};
  // let loadingErr = false;
  const codebases = targetCodebases(functionsConfig);

  // This is best effort only and would be confusing to see so suppress it
  silenceLogging();
  for (const codebase of codebases) {
    try {
      const filters = [{ codebase: `${codebase}` }];
      const builds = await loadCodebases(
        functionsConfig,
        options,
        firebaseConfig,
        runtimeConfig,
        filters,
      );
      functionsBuilds = { ...functionsBuilds, ...builds };
    } catch (err) {
      // loadingErr = true;
    }
  }
  resumeLogging();
  // TODO(ifielker): uncomment when we allow writing extensions to codebases.
  // if (loadingErr) {
  //   // This means we couldn't load at least one of the codebase(s).
  //   // So we may be asking you if you want to delete extensions that are
  //   // defined in those codebases.
  //   logLabeledWarning(
  //     "extensions",
  //     "Unable to determine if additional extensions are defined in other code bases. Other codebases may have syntax or runtime errors.",
  //   );
  // }

  return extractExtensionsFromBuilds(functionsBuilds);
}

/**
 * Extracts extensions from build records
 * @param builds The builds to examine
 * @param filters The filters to use
 * @return a record of extensions by extensionId
 */
export function extractExtensionsFromBuilds(
  builds: Record<string, Build>,
  filters?: Filter[],
): Record<string, DynamicExtension> {
  const extRecords: Record<string, DynamicExtension> = {};
  for (const [codebase, build] of Object.entries(builds)) {
    if (build.extensions) {
      for (const [id, ext] of Object.entries(build.extensions)) {
        if (extensionMatchesAnyFilter(codebase, id, filters)) {
          extRecords[id] = ext;
        }
      }
    }
  }

  return extRecords;
}

function extensionMatchesAnyFilter(
  codebase: string,
  extensionId: string,
  filters?: Filter[],
): boolean {
  if (!filters) {
    return true;
  }
  return filters.some((f) => extensionMatchesFilter(codebase, extensionId, f));
}

function extensionMatchesFilter(codebase: string, extensionId: string, filter: Filter): boolean {
  if (codebase && filter.codebase) {
    if (codebase !== filter.codebase) {
      return false;
    }
  }

  if (!filter.idChunks) {
    // If idChunks are not provided, we match all extensions.
    return true;
  }

  const idChunks = extensionId.split("-");
  if (idChunks.length < filter.idChunks.length) {
    return false;
  }
  for (let i = 0; i < filter.idChunks.length; i++) {
    if (idChunks[i] !== filter.idChunks[i]) {
      return false;
    }
  }
  return true;
}
