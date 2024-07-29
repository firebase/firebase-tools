import * as fs from "fs";
import * as path from "path";
import { confirm } from "../../prompt";
import * as fsutils from "../../fsutils";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { FirebaseError } from "../../error";
import { Options } from "../../options";
import {
  DEFAULT_CODEBASE,
  configForCodebase,
  normalizeAndValidate,
} from "../../functions/projectConfig";
import { loadCodebases } from "../../deploy/functions/prepare";
import { Build, DynamicExtension } from "../../deploy/functions/build";
import {getFirebaseConfig} from "../../functionsConfig";
import { EndpointFilter as Filter } from "../../deploy/functions/functionsDeployHelper";
import {ExtensionSpec} from "../types";

export {DynamicExtension} from "../../deploy/functions/build";
import * as functionRuntimes from "../../deploy/functions/runtimes";
import * as nodeRuntime from "./node";
import { logger } from "../../logger";

const savedLoggerSilent = (logger as any).silent;

export function silenceLogging() {
  (logger as any).silent = true;
}

export function resumeLogging() {
  (logger as any).silent = savedLoggerSilent;
}

export function fixHyperlink(txt: string): string {
  // default hyperlinks are not readable on black.
  const DARK_BLUE = "\u001b[34m";
  const BRIGHT_CYAN = "\u001b[36;1m";
  return txt.replaceAll(DARK_BLUE, BRIGHT_CYAN);
}

export async function extractAllDynamicExtensions(
  projectId: string,
  options: Options
): Promise<Record<string, DynamicExtension>> {
  // This looks for extensions in ALL functions codebases.
  // Because we can have a situation where we are deploying
  // from codebase A and also have extensions in codebase B. We don't want
  // to ask to delete extensions from codebase B in that case, so we 
  // need to exclude those from the deletions.
  const firebaseConfig = await getFirebaseConfig(options);
  const runtimeConfig: Record<string, unknown> = {firebase: firebaseConfig};
  const functionsConfig = normalizeAndValidate(options.config.src.functions);
  //console.log("DEBUGGG: extensions loadCodeBases");

  let functionsBuilds: Record<string, Build> = {};
  try {
    // Get the full list of extensions in any codebase, so we don't ask to 
    // delete them when we are doing a partial deploy.
    //silenceLogging();  // DEBUGGG - silence back on after debugging
    functionsBuilds = await loadCodebases(functionsConfig, options, firebaseConfig, runtimeConfig);
  } catch (err) {
    // This means we couldn't load the codebase(s). So we may be asking you if you
    // want to delete extensions that are defined in those codebases.
    logLabeledWarning("extensions", "Unable to determine if additional extensions are defined in other code bases.");
    functionsBuilds = {};
  }

  resumeLogging();
  
  return extractExtensionsFromBuilds(functionsBuilds);
}

export function extractExtensionsFromBuilds(builds: Record<string, Build>, filters?: Filter[]) {
  const extRecords: Record<string, DynamicExtension> = {};
  Object.entries(builds).forEach(([codebase, build]) => {
    if (build.extensions) {
      Object.entries(build.extensions).forEach(([id, ext]) => {
        if (extensionMatchesAnyFilter(codebase, id, filters)) {
          extRecords[id] = ext;
        }
      });
    }
  });

  return extRecords;
}

function extensionMatchesAnyFilter(codebase: string, extensionId: string, filters?: Filter[]): boolean {
  if (!filters) { 
    return true;
  }
  return filters.some((f) => extensionMatchesFilter(codebase, extensionId, f));
}

function extensionMatchesFilter(codebase: string, extensionId: string, filter: Filter): boolean {
  if (codebase && filter.codebase) {
    if (codebase != filter.codebase) {
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
    if (idChunks[i] != filter.idChunks[i]) {
      return false;
    }
  }
  return true;
}

export async function isTypescriptCodebase(codebaseDir: string) {
  return fsutils.fileExistsSync(path.join(codebaseDir, "tsconfig.json"));
}

export async function writeFile(filePath: string, data: string, options: any) {
  const shortFilePath = filePath.replace(process.cwd(), ".");
  if (fsutils.fileExistsSync(filePath)) {
    if (
      await confirm({
        message: `${shortFilePath} already exists. Overwite it?`,
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: false,
      })
    ) {
      // overwrite
      try {
        await fs.promises.writeFile(filePath, data, { flag: "w" });
        logLabeledBullet("extensions", `successfully wrote ${shortFilePath}`);
      } catch (err) {
        throw new FirebaseError(`Failed to write ${shortFilePath}:\n    ${err}`);
      }
    } else {
      // don't overwrite
      return;
    }
  } else {
    // write new file
    // Make sure the directories exist
    await fs.promises
      .mkdir(path.dirname(filePath), { recursive: true })
      .then(async () => {
        try {
          await fs.promises.writeFile(`${filePath}`, data, { flag: "w" });
          logLabeledBullet("extensions", `successfully created ${shortFilePath}`);
        } catch (err) {
          throw new FirebaseError(`Failed to create ${shortFilePath}:\n    ${err}`);
        }
      })
      .catch((err: any) => {
        throw new FirebaseError(`Error during SDK file creation:\n    ${err}`);
      });
  }
}

// /google/src/cloud/ifielker/experimentalExtension/google3/experimental/users/ifielker/FirebaseTaskExtension/

export async function copyDirectory(src: string, dest: string, options: any) {
  const shortDestPath = dest.replace(process.cwd(), ",");
  if (fsutils.dirExistsSync(dest)) {
    if (await confirm({
      message: `${shortDestPath} already exists. Copy anyway?`,
      nonInteractive: options.nonInteractive,
      force: options.force,
      default: false,
    })) {
      // copy anyway
      let entries = await fs.promises.readdir(src, { withFileTypes: true });
      for (let entry of entries) {
        const srcPath = path.join(src, entry.name);
        let destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          if (srcPath.includes("node_modules")) {
            // skip these
            continue;
          }
          // We already have permission. Don't ask again.
          await copyDirectory(srcPath, destPath, { force: true });
        } else if (entry.isFile())
        try {
          await fs.promises.copyFile(srcPath, destPath);
        } catch (err) {
          throw new FirebaseError(`Failed to copy ${destPath.replace(process.cwd(), ".")}:\n    ${err}`);
        }
      }
    } else {
      // Don't overwrite
      return;
    }
  } else {
    await fs.promises
      .mkdir(dest, { recursive: true })
      .then(async () => {
         await copyDirectory(src, dest, {force: true});
      })
  }
}

// Figure out which runtime we are using, then call the appropriate
// runtime.WriteSDK
export async function writeSDK(
  extensionRef: string | undefined,
  localPath: string | undefined,
  spec: ExtensionSpec,
  options: any
): Promise<string> {
  // Figure out which runtime we need
  const config = normalizeAndValidate(options.config.src.functions);
  const codebaseConfig = configForCodebase(
    config, 
    (options.codebase as string) || DEFAULT_CODEBASE
  );
  const sourceDirName = codebaseConfig.source;
  const sourceDir = options.config.path(sourceDirName);
  const delegateContext: functionRuntimes.DelegateContext = {
    projectId: "",  // not needed to determine the runtime in the function below
    sourceDir,
    projectDir: options.config.projectDir,
    runtime: codebaseConfig.runtime,
  };
  let delegate: functionRuntimes.RuntimeDelegate;
  try {
    delegate = await functionRuntimes.getRuntimeDelegate(delegateContext);
  }
  catch(err) {
    throw new FirebaseError(`Could not detect target language for SDK at ${sourceDir}`);
  }

  // If the delegate is NodeJS, write the SDK
  // If we have more options, it would be better to have an extensions delegate
  if (delegate.runtime.startsWith("nodejs")) {
    const sampleImport = await nodeRuntime.writeSDK(extensionRef, localPath, spec, options);
    return sampleImport;
  } else {
    throw new FirebaseError(`Extension SDK generation is currently only supported for NodeJs. We detected the target source to be: ${delegate.runtime}`);
  }
}

export function getCodebaseDir(options: Options): string {
  const config = normalizeAndValidate(options.config.src.functions);
  const codebaseConfig = configForCodebase(
    config,
    (options.codebase as string) || DEFAULT_CODEBASE
  );
  return `${options.projectRoot}/${codebaseConfig.source}/`;
}

export function getInstallPathPrefix(options: Options): string {
  return `${getCodebaseDir(options)}generated/extensions/`;
}

export function toTitleCase(txt: string): string {
  return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
}

export function capitalizeFirstLetter(txt: string): string {
  return txt.charAt(0).toUpperCase() + txt.substring(1);
}

export function lowercaseFirstLetter(txt: string): string {
  return txt.charAt(0).toLowerCase() + txt.substring(1);
}

export function snakeToCamelCase(txt: string): string {
  let ret = txt.toLowerCase();
  ret = ret.replace(/_/g, " ");
  ret = ret.replace(/\w\S*/g, toTitleCase);
  ret = ret.charAt(0).toLowerCase() + ret.substring(1);
  return ret;
}

export function longestCommonPrefix(arr: string[]): string {
  if (arr.length === 0) {
    return "";
  }
  let prefix = "";
  for (let pos = 0; pos < arr[0].length; pos++) {
    if (arr.every((s) => s.charAt(pos) === arr[0][pos])) {
      prefix += arr[0][pos];
    } else break;
  }
  return prefix;
}
