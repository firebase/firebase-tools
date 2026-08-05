import * as fs from "fs";
import * as path from "path";
import { execSync } from "node:child_process";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import {
  commandExistsSync,
  logLabeledBullet,
  logLabeledWarning,
  murmurHashV3,
  pLimit,
} from "../utils";
import * as gcs from "../gcp/storage";
import { archiveFile } from "../archiveFile";
import { Options } from "../options";

export interface CommandOptions extends Options {
  app?: string;
  bucketLocation?: string;
  appVersion?: string;
  retryDelay?: number;
}

export interface SourceMap {
  name: string;
  appId: string;
  version: string;
  obfuscatedFilePath: string;
  fileUri: string;
}

export interface SourceMapMapping {
  mapFilePath: string;
  obfuscatedFilePath: string;
}

export interface UploadRequest {
  projectId: string;
  mappingFile: string;
  obfuscatedFilePath: string;
  bucketName: string;
  appVersion: string;
  options: CommandOptions;
}

export const CONCURRENCY = 25;

/**
 * Checks if the Google App ID is provided in command options.
 * Throws a FirebaseError if it is missing.
 */
export function checkGoogleAppID(options: CommandOptions): void {
  if (!options.app) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
  }
}

/**
 * Resolves the application version string.
 * Uses explicit appVersion option, then falls back to git commit hash, then package version.
 */
export function getAppVersion(options: CommandOptions): string {
  if (options.appVersion) {
    return options.appVersion;
  }
  const gitCommit = getGitCommit();
  if (gitCommit) {
    logLabeledBullet("crashlytics", `Using git commit as app version: ${gitCommit}`);
    return gitCommit;
  }
  const packageVersion = getPackageVersion();
  if (packageVersion) {
    logLabeledBullet("crashlytics", `Using package version as app version: ${packageVersion}`);
    return packageVersion;
  }
  return "unset";
}

/**
 * Retrieves the current Git commit hash if available.
 */
export function getGitCommit(): string | undefined {
  if (!commandExistsSync("git")) {
    return undefined;
  }
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (error) {
    return undefined;
  }
}

/**
 * Retrieves the current project version from package.json if npm is available.
 */
export function getPackageVersion(): string | undefined {
  if (!commandExistsSync("npm")) {
    return undefined;
  }
  try {
    return execSync("npm pkg get version").toString().trim().replaceAll('"', "");
  } catch (error) {
    return undefined;
  }
}

/**
 * Creates or gets the Google Cloud Storage bucket for Crashlytics source maps.
 */
export async function upsertBucket(
  projectId: string,
  projectNumber: string,
  options: CommandOptions,
): Promise<string> {
  let loc = "US-CENTRAL1";
  if (options.bucketLocation) {
    loc = options.bucketLocation.toUpperCase();
  } else {
    logLabeledBullet(
      "crashlytics",
      "No Google Cloud Storage bucket location specified. Defaulting to US-CENTRAL1.",
    );
  }

  const baseName = `firebasecrashlytics-sourcemaps-${projectNumber}-${loc.toLowerCase()}`;
  return await gcs.upsertBucket({
    product: "crashlytics",
    createMessage: `Creating Cloud Storage bucket in ${loc} to store Crashlytics source maps at ${baseName}...`,
    projectId,
    req: {
      baseName,
      purposeLabel: `crashlytics-sourcemaps-${loc.toLowerCase()}`,
      location: loc,
      lifecycle: {
        rule: [
          {
            action: {
              type: "Delete",
            },
            condition: {
              age: 30,
            },
          },
        ],
      },
    },
  });
}

/**
 * Scans files to discover mapping files and links them to source assets.
 * Supports both traditional sourcemap comments (//# sourceMappingURL=...) and
 * hidden sourcemaps (generated without sourceMappingURL comments).
 */
export async function findSourceMapMappings(
  files: { name: string }[],
  rootDir: string,
): Promise<SourceMapMapping[]> {
  const jsFiles = files.filter((f) => f.name.endsWith(".js"));
  const mapFiles = files.filter((f) => f.name.endsWith(".js.map"));

  const mappings: SourceMapMapping[] = [];
  const mapFilePathsSet = new Set(mapFiles.map((f) => path.resolve(f.name)));
  const jsFilesSet = new Set(jsFiles.map((f) => path.resolve(f.name)));

  // Track map files and JS files that have been successfully linked
  const linkedMapFilePaths = new Set<string>();
  const linkedJsFilePaths = new Set<string>();

  const limit = pLimit(CONCURRENCY);

  // Pass 1: Traditional sourcemaps - check JS files for sourceMappingURL comments
  const traditionalResults = await Promise.all(
    jsFiles.map((jsFile) =>
      limit(async () => {
        const mapFilePath = await getLinkedSourceMapPath(jsFile.name);
        return { jsFile, mapFilePath };
      }),
    ),
  );

  for (const { jsFile, mapFilePath } of traditionalResults) {
    if (mapFilePath) {
      const resolvedMapPath = path.resolve(mapFilePath);
      const resolvedJsPath = path.resolve(jsFile.name);
      if (mapFilePathsSet.has(resolvedMapPath) && !linkedMapFilePaths.has(resolvedMapPath)) {
        mappings.push({
          mapFilePath,
          obfuscatedFilePath: path.relative(rootDir, resolvedJsPath),
        });
        linkedMapFilePaths.add(resolvedMapPath);
        linkedJsFilePaths.add(resolvedJsPath);
      }
    }
  }

  // Pass 2: Hidden sourcemaps - for map files not linked in Pass 1, resolve matching JS files
  const unlinkedMapFiles = mapFiles.filter((f) => !linkedMapFilePaths.has(path.resolve(f.name)));
  const availableJsFilesSet = new Set(
    [...jsFilesSet].filter((jsPath) => !linkedJsFilePaths.has(jsPath)),
  );

  const hiddenResults = await Promise.all(
    unlinkedMapFiles.map((mapFile) =>
      limit(async () => {
        const resolvedMapPath = path.resolve(mapFile.name);
        const targetJsPath = await findHiddenSourceMapTarget(mapFile.name, availableJsFilesSet);
        return { mapFile, targetJsPath, resolvedMapPath };
      }),
    ),
  );

  for (const { mapFile, targetJsPath, resolvedMapPath } of hiddenResults) {
    if (targetJsPath && !linkedJsFilePaths.has(path.resolve(targetJsPath))) {
      const resolvedJsPath = path.resolve(targetJsPath);
      mappings.push({
        mapFilePath: mapFile.name,
        obfuscatedFilePath: path.relative(rootDir, resolvedJsPath),
      });
      linkedMapFilePaths.add(resolvedMapPath);
      linkedJsFilePaths.add(resolvedJsPath);
    } else if (!linkedMapFilePaths.has(resolvedMapPath)) {
      // Pass 3: Unlinked map files without matching JS file map to themselves (fallback)
      mappings.push({
        mapFilePath: mapFile.name,
        obfuscatedFilePath: path.relative(rootDir, resolvedMapPath),
      });
      linkedMapFilePaths.add(resolvedMapPath);
    }
  }

  return mappings;
}

/**
 * Extracts the optional 'file' field from the header of a source map file.
 * Reads the initial chunk of the file to quickly parse the property without loading massive mapping tables into memory.
 */
export async function extractSourceMapFileField(mapFilePath: string): Promise<string | undefined> {
  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    const stat = await fs.promises.stat(mapFilePath);
    const size = stat.size;
    if (size === 0) {
      return undefined;
    }
    const bufferSize = Math.min(size, 16384);
    fileHandle = await fs.promises.open(mapFilePath, "r");
    const buffer = Buffer.alloc(bufferSize);
    const { bytesRead } = await fileHandle.read(buffer, 0, bufferSize, 0);
    const header = buffer.toString("utf-8", 0, bytesRead);
    const regex = /"file"\s*:\s*"(?<file>(?:[^"\\]|\\.)*)"/;
    const match = regex.exec(header);
    const file = match?.groups?.file;
    if (file) {
      try {
        const decoded = JSON.parse(`"${file}"`) as string;
        const trimmed = decoded.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      } catch {
        const trimmed = file.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
    }
  } catch (e) {
    logger.debug(
      `Error reading source map file property from ${mapFilePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (e) {
        // Ignore close error
      }
    }
  }
  return undefined;
}

/**
 * Finds the corresponding JS target file for a hidden source map.
 * Checks by filename convention (e.g. foo.js.map -> foo.js) and the source map 'file' property.
 */
export async function findHiddenSourceMapTarget(
  mapFilePath: string,
  jsFilesSet?: Set<string>,
): Promise<string | undefined> {
  const resolvedMapPath = path.resolve(mapFilePath);
  const mapDir = path.dirname(resolvedMapPath);

  // Strategy 1: Check by convention (e.g., stripping '.map' suffix from 'foo.js.map' -> 'foo.js')
  if (resolvedMapPath.endsWith(".map")) {
    const candidateJsPath = resolvedMapPath.slice(0, -4);
    if (jsFilesSet ? jsFilesSet.has(candidateJsPath) : fs.existsSync(candidateJsPath)) {
      return candidateJsPath;
    }
  }

  // Strategy 2: Check the 'file' property inside the source map JSON
  const fileField = await extractSourceMapFileField(resolvedMapPath);
  if (fileField) {
    // Check relative to the source map directory
    const candidateJsPath = path.resolve(mapDir, fileField);
    if (jsFilesSet ? jsFilesSet.has(candidateJsPath) : fs.existsSync(candidateJsPath)) {
      return candidateJsPath;
    }

    // Check if any known JS file matches the fileField basename in the same directory
    const baseCandidate = path.resolve(mapDir, path.basename(fileField));
    if (jsFilesSet ? jsFilesSet.has(baseCandidate) : fs.existsSync(baseCandidate)) {
      return baseCandidate;
    }
  }

  return undefined;
}

/**
 * Extracts sourceMappingURL value from the last 4KB tail of a JS file.
 */
export async function getLinkedSourceMapPath(jsFilePath: string): Promise<string | undefined> {
  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    const stat = await fs.promises.stat(jsFilePath);
    const size = stat.size;
    // The sourceMappingURL comment is always appended to the very end of the JS file by compilers.
    // Reading the entire file can block the event loop and cause out-of-memory errors for large production
    // bundles (often several megabytes). Reading only the last 4KB avoids this and improves performance.
    const bufferSize = Math.min(size, 4096);
    if (bufferSize === 0) {
      return undefined;
    }
    fileHandle = await fs.promises.open(jsFilePath, "r");
    const buffer = Buffer.alloc(bufferSize);
    const { bytesRead } = await fileHandle.read(buffer, 0, bufferSize, size - bufferSize);
    const tail = buffer.toString("utf-8", 0, bytesRead);
    const regex = /^\/\/\s*[#@]\s*sourceMappingURL=(?<sourceMappingURL>.+)\s*$/m;
    const match = regex.exec(tail);
    const sourceMappingURL = match?.groups?.sourceMappingURL?.trim();
    if (sourceMappingURL) {
      return path.join(path.dirname(jsFilePath), sourceMappingURL);
    }
  } catch (e) {
    logger.debug(
      `Error reading sourceMappingURL from ${jsFilePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (e) {
        // Ignore close error
      }
    }
  }
  return undefined;
}

export interface UploadResult {
  successCount: number;
  failedFiles: string[];
}

/**
 * Orchestrates direct parallel uploads with safe rate limiting concurrency checks and retry actions.
 */
export async function uploadSourceMaps(
  mappings: SourceMapMapping[],
  request: {
    projectId: string;
    bucketName: string;
    appVersion: string;
    options: CommandOptions;
  },
): Promise<UploadResult> {
  const { projectId, bucketName, appVersion, options } = request;
  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(
    mappings.map((mapping) =>
      limit(async () => {
        const uploadRequest: UploadRequest = {
          projectId,
          mappingFile: mapping.mapFilePath,
          obfuscatedFilePath: mapping.obfuscatedFilePath,
          bucketName,
          appVersion,
          options,
        };
        let success = await uploadMap(uploadRequest, 1);
        if (!success) {
          // Wait 5s and retry
          await new Promise((res) => setTimeout(res, options.retryDelay || 5000));
          success = await uploadMap(uploadRequest);
        }
        return success;
      }),
    ),
  );

  let successCount = 0;
  const failedFiles: string[] = [];
  for (const [i, success] of results.entries()) {
    if (success) {
      successCount++;
    } else {
      failedFiles.push(mappings[i].mapFilePath);
    }
  }

  return {
    successCount,
    failedFiles,
  };
}

/**
 * Prepares zip archive bundle assets and performs file upload tasks to Google Cloud Storage.
 */
export async function uploadMap(request: UploadRequest, attemptsRemaining = 0): Promise<boolean> {
  const { projectId, mappingFile, obfuscatedFilePath, bucketName, appVersion, options } = request;
  const filePath = path.relative(options.projectRoot ?? process.cwd(), mappingFile);
  const obfuscatedPath = obfuscatedFilePath
    .split(path.sep)
    .map((p) => (p === ".next" ? "_next" : p))
    // TODO(andrewbrook): add flag to allow uploading dev maps
    .filter((p) => p !== "dev")
    .join("/");
  const tmpArchive = await archiveFile(filePath, { archivedFileName: "mapping.js.map" });
  const appId = options.app || "";
  const gcsFile = `${appId}-${appVersion}-${normalizeFileName(obfuscatedPath)}.zip`;
  const uid = murmurHashV3(`${appId}-${appVersion}-${obfuscatedPath}`);
  const name = `projects/${projectId}/locations/global/mappingFiles/${uid}`;

  const stream = fs.createReadStream(tmpArchive);
  stream.on("error", (err) => {
    logger.debug(`Stream error on tmpArchive: ${err instanceof Error ? err.message : String(err)}`);
  });

  try {
    const { bucket, object } = await gcs.uploadObject(
      {
        file: gcsFile,
        stream,
      },
      bucketName,
    );
    const fileUri = `gs://${bucket}/${object}`;
    logger.debug(`Uploaded mapping file ${filePath} to ${fileUri}`);

    await registerSourceMap({
      name,
      appId,
      version: appVersion,
      obfuscatedFilePath: `/${obfuscatedPath}`,
      fileUri,
    });
    logger.debug(`Registered mapping file ${filePath}`);

    return true;
  } catch (e) {
    if (attemptsRemaining === 0) {
      logLabeledWarning(
        "crashlytics",
        `Failed to upload mapping file ${filePath}:\n${e instanceof Error ? e.message : String(e)}`,
      );
    }
    return false;
  } finally {
    stream.destroy();
    try {
      fs.rmSync(tmpArchive, { force: true });
    } catch (err) {
      logger.debug(
        `Failed to delete temporary archive ${tmpArchive}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Normalizes file paths to avoid backslash and forward slash issues.
 */
export function normalizeFileName(fileName: string): string {
  return fileName.replaceAll(/\//g, "-");
}

/**
 * Submits resource descriptors to the Firebase Telemetry API to register completed source maps.
 */
export async function registerSourceMap(sourceMap: SourceMap): Promise<void> {
  const client = new Client({
    urlPrefix: "https://firebasetelemetryadmin.googleapis.com",
    auth: true,
    apiVersion: "v1alpha",
  });

  try {
    await client.patch(sourceMap.name, sourceMap, { queryParams: { allowMissing: "true" } });
    logger.debug(
      `Registered source map ${sourceMap.obfuscatedFilePath} with Firebase Telemetry service`,
    );
  } catch (e) {
    if (e instanceof FirebaseError) {
      // Ignore 409 errors, as they indicate the source map was recently uploaded
      if (e.status === 409) {
        return;
      }
    }
    throw new FirebaseError(
      `Failed to register source map ${sourceMap.obfuscatedFilePath} with Firebase Telemetry service:\n${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
