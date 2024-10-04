import * as fs from "fs";
import * as path from "path";
import { confirm } from "../../prompt";
import * as fsutils from "../../fsutils";
import { logLabeledBullet } from "../../utils";
import { FirebaseError, getErrMsg } from "../../error";
import { Options } from "../../options";
import {
  DEFAULT_CODEBASE,
  configForCodebase,
  normalizeAndValidate,
} from "../../functions/projectConfig";
import { Build, DynamicExtension } from "../../deploy/functions/build";
import { EndpointFilter as Filter } from "../../deploy/functions/functionsDeployHelper";
import { ExtensionSpec } from "../types";
import * as functionRuntimes from "../../deploy/functions/runtimes";
import * as nodeRuntime from "./node";

export { DynamicExtension } from "../../deploy/functions/build";

/**
 * Fixes unreadable dark blue on black background to be cyan
 * @param txt The formatted text containing color codes
 * @return The formatted text with blue replaced by cyan.
 */
export function fixDarkBlueText(txt: string): string {
  // default hyperlinks etc. are not readable on black.
  const DARK_BLUE = "\u001b[34m";
  const BRIGHT_CYAN = "\u001b[36;1m";
  return txt.replaceAll(DARK_BLUE, BRIGHT_CYAN);
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
          if (extRecords[id]) {
            // Duplicate definitions of the same instance
            throw new FirebaseError(`Duplicate extension id found: ${id}`);
          }
          extRecords[id] = { ...ext, labels: { createdBy: "SDK", codebase } };
        }
      }
    }
  }

  return extRecords;
}

/**
 * Checks if the extension matches any filter
 * @param codebase The codebase to check
 * @param extensionId The extension to check
 * @param filters The filters to check against
 * @return true if the extension matches any of the filters.
 */
export function extensionMatchesAnyFilter(
  codebase: string | undefined,
  extensionId: string,
  filters?: Filter[],
): boolean {
  if (!filters) {
    return true;
  }
  return filters.some((f) => extensionMatchesFilter(codebase, extensionId, f));
}

/**
 * Checks if the extension matches a filter
 * @param codebase The codebase to check
 * @param extensionId The extension to check
 * @param filter The fitler to check against
 * @return true if the extension matches the filter.
 */
function extensionMatchesFilter(
  codebase: string | undefined,
  extensionId: string,
  filter: Filter,
): boolean {
  if (codebase && filter.codebase) {
    if (codebase !== filter.codebase) {
      return false;
    }
  }

  if (!filter.idChunks) {
    // If idChunks are not provided, we match all extensions.
    return true;
  }

  // Extension instance ids are not nested. They are unique to a project.
  // They are allowed to have hyphens, so in the functions filter this will be
  // interpreted as nested chunks, so we join them again to get the original id.
  const filterId = filter.idChunks.join("-");

  return extensionId === filterId;
}

/**
 * Looks for the tsconfig.json file
 * @param codebaseDir The codebase directory to check
 * @return true iff the codebase directory is typescript.
 */
export function isTypescriptCodebase(codebaseDir: string): boolean {
  return fsutils.fileExistsSync(path.join(codebaseDir, "tsconfig.json"));
}

/**
 * Writes a file containing data. Asks permission based on options
 * @param filePath Where the create a file
 * @param data What to put into the file
 * @param options options for force or nonInteractive to skip permission requests
 */
export async function writeFile(filePath: string, data: string, options: Options): Promise<void> {
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
      } catch (err: unknown) {
        throw new FirebaseError(`Failed to write ${shortFilePath}:\n    ${getErrMsg(err)}`);
      }
    } else {
      // don't overwrite
      return;
    }
  } else {
    // write new file
    // Make sure the directories exist
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      try {
        await fs.promises.writeFile(`${filePath}`, data, { flag: "w" });
        logLabeledBullet("extensions", `successfully created ${shortFilePath}`);
      } catch (err: unknown) {
        throw new FirebaseError(`Failed to create ${shortFilePath}:\n    ${getErrMsg(err)}`);
      }
    } catch (err: unknown) {
      throw new FirebaseError(`Error during SDK file creation:\n    ${getErrMsg(err)}`);
    }
  }
}

/**
 * copies one directory to another recursively creating directories as needed.
 * It will ask for permission before overwriting any existing files.
 * @param src The source path
 * @param dest The destination path
 * @param options The command options
 */
export async function copyDirectory(src: string, dest: string, options: Options): Promise<void> {
  const shortDestPath = dest.replace(process.cwd(), ",");
  if (fsutils.dirExistsSync(dest)) {
    if (
      await confirm({
        message: `${shortDestPath} already exists. Copy anyway?`,
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: false,
      })
    ) {
      // copy anyway
      const entries = await fs.promises.readdir(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          if (srcPath.includes("node_modules")) {
            // skip these
            continue;
          }
          // We already have permission. Don't ask again.
          await copyDirectory(srcPath, destPath, { ...options, force: true });
        } else if (entry.isFile())
          try {
            await fs.promises.copyFile(srcPath, destPath);
          } catch (err: unknown) {
            throw new FirebaseError(
              `Failed to copy ${destPath.replace(process.cwd(), ".")}:\n    ${getErrMsg(err)}`,
            );
          }
      }
    } else {
      // Don't overwrite
      return;
    }
  } else {
    await fs.promises.mkdir(dest, { recursive: true });
    await copyDirectory(src, dest, { ...options, force: true });
  }
}

/**
 * getCodebaseRuntime determines the runtime from the specified optoins
 * @param options The options passed to the command
 * @return as string like 'nodejs18' or 'python312' representing the runtime.
 */
export async function getCodebaseRuntime(options: Options): Promise<string> {
  const config = normalizeAndValidate(options.config.src.functions);
  const codebaseConfig = configForCodebase(
    config,
    (options.codebase as string) || DEFAULT_CODEBASE,
  );
  const sourceDirName = codebaseConfig.source;
  const sourceDir = options.config.path(sourceDirName);
  const delegateContext: functionRuntimes.DelegateContext = {
    projectId: "", // not needed to determine the runtime in the function below
    sourceDir,
    projectDir: options.config.projectDir,
    runtime: codebaseConfig.runtime,
  };
  let delegate: functionRuntimes.RuntimeDelegate;
  try {
    delegate = await functionRuntimes.getRuntimeDelegate(delegateContext);
  } catch (err: unknown) {
    throw new FirebaseError(`Could not detect target language for SDK at ${sourceDir}`);
  }

  return delegate.runtime;
}

/**
 * writeSDK figures out which runtime we are using and then calls
 * that runtime's implementation of writeSDK.
 * @param extensionRef The extension reference of a published extension
 * @param localPath The localPath of a local extension
 * @param spec The spec for the extension
 * @param options The options passed from the ext:sdk:install command
 * @return Usage instructions for the SDK.
 */
export async function writeSDK(
  extensionRef: string | undefined,
  localPath: string | undefined,
  spec: ExtensionSpec,
  options: Options,
): Promise<string> {
  // Figure out which runtime we need
  const runtime = await getCodebaseRuntime(options);

  // If the delegate is NodeJS, write the SDK
  // If we have more options, it would be better to have an extensions delegate
  if (runtime.startsWith("nodejs")) {
    let sampleImport = await nodeRuntime.writeSDK(extensionRef, localPath, spec, options);
    sampleImport = fixDarkBlueText(sampleImport);
    return sampleImport;
  } else {
    throw new FirebaseError(
      `Extension SDK generation is currently only supported for NodeJs. We detected the target source to be: ${runtime}`,
    );
  }
}

/**
 * getCodebaseDir gets the codebase directory based on the options passed
 * @param options are used to determine which codebase and the config for it
 * @return a functions codebase directory
 */
export function getCodebaseDir(options: Options): string {
  if (!options.projectRoot) {
    throw new FirebaseError("Unable to determine root directory of project");
  }
  const config = normalizeAndValidate(options.config.src.functions);
  const codebaseConfig = configForCodebase(
    config,
    (options.codebase as string) || DEFAULT_CODEBASE,
  );
  return `${options.projectRoot}/${codebaseConfig.source}/`;
}

/**
 * getInstallPathPrefix gets a prefix under the codebase directory
 * for where extension SDKs should be installed.
 * @param options are used to get the functions codebase directory
 * @return an SDK install path prefix
 */
export function getInstallPathPrefix(options: Options): string {
  return `${getCodebaseDir(options)}generated/extensions/`;
}

/**
 * toTitleCase takes the input string, capitalizes the first letter, and
 * lowercases the rest of the letters aBcdEf -> Abcdef
 * @param txt The text to transform
 * @return The title cased string
 */
export function toTitleCase(txt: string): string {
  return txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase();
}

/**
 * capitalizeFirstLetter capitalizes the first letter of the input string
 * @param txt the string to transform
 * @return the input string with the first letter capitalized
 */
export function capitalizeFirstLetter(txt: string): string {
  return txt.charAt(0).toUpperCase() + txt.substring(1);
}

/**
 * lowercaseFirstLetter makes the first letter of a string lowercase
 * @param txt a string to transform
 * @return the input string but with the first letter lowercase
 */
export function lowercaseFirstLetter(txt: string): string {
  return txt.charAt(0).toLowerCase() + txt.substring(1);
}

/**
 * snakeToCamelCase transforms text from snake_case to camelCase.
 * @param txt the snake_case string to transform
 * @return a camelCase string
 */
export function snakeToCamelCase(txt: string): string {
  let ret = txt.toLowerCase();
  ret = ret.replace(/_/g, " ");
  ret = ret.replace(/\w\S*/g, toTitleCase);
  ret = ret.charAt(0).toLowerCase() + ret.substring(1);
  return ret;
}

/**
 * longestCommonPrefix extracts the longest common prefix from an array of string
 * @param arr The array to find a longest common prefix in.
 * @return A string that is the longest common prefix
 */
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
