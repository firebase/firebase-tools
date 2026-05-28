import * as fs from "fs";
import * as path from "path";
import { execSync } from "node:child_process";
import * as pLimit from "p-limit";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { commandExistsSync, logLabeledBullet, logLabeledWarning, murmurHashV3 } from "../utils";
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

export function checkGoogleAppID(options: CommandOptions): void {
  if (!options.app) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
  }
}

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

export async function upsertBucket(
  projectId: string,
  projectNumber: string,
  options: CommandOptions,
): Promise<string> {
  let loc: string = "US-CENTRAL1";
  if (options.bucketLocation) {
    loc = (options.bucketLocation as string).toUpperCase();
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

export async function findSourceMapMappings(
  files: { name: string }[],
  rootDir: string,
): Promise<SourceMapMapping[]> {
  const jsFiles = files.filter((f) => f.name.endsWith(".js"));
  const mapFiles = files.filter((f) => f.name.endsWith(".js.map"));

  const mappings: SourceMapMapping[] = [];
  const mapFilePathsSet = new Set(mapFiles.map((f) => f.name));
  // Set to track map files that were linked from a JS file (via `sourceMappingURL` comment)
  const mapFilesLinkedInJsComment = new Set<string>();

  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(
    jsFiles.map((jsFile) =>
      limit(async () => {
        const mapFilePath = await getLinkedSourceMapPath(jsFile.name);
        return { jsFile, mapFilePath };
      })
    )
  );

  for (const { jsFile, mapFilePath } of results) {
    if (mapFilePath && mapFilePathsSet.has(mapFilePath)) {
      mappings.push({
        mapFilePath,
        obfuscatedFilePath: path.relative(rootDir, path.resolve(jsFile.name)),
      });
      mapFilesLinkedInJsComment.add(mapFilePath);
    }
  }

  // Add map files that were not linked from any JS file
  for (const mapFile of mapFiles) {
    if (!mapFilesLinkedInJsComment.has(mapFile.name)) {
      mappings.push({
        mapFilePath: mapFile.name,
        obfuscatedFilePath: path.relative(rootDir, path.resolve(mapFile.name)),
      });
    }
  }

  return mappings;
}

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
    await fileHandle.read(buffer, 0, bufferSize, size - bufferSize);
    const tail = buffer.toString("utf-8");
    const match = tail.match(/^\/\/\s*[#@]\s*sourceMappingURL=(?<sourceMappingURL>.+)\s*$/m);
    const sourceMappingURL = match?.groups?.sourceMappingURL?.trim();
    if (sourceMappingURL) {
      return path.join(path.dirname(jsFilePath), sourceMappingURL);
    }
  } catch (e) {
    logger.debug(`Error reading sourceMappingURL from ${jsFilePath}: ${e}`);
  } finally {
    if (fileHandle !== undefined) {
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

export async function uploadSourceMaps(
  mappings: SourceMapMapping[],
  request: {
    projectId: string;
    bucketName: string;
    appVersion: string;
    options: CommandOptions;
  }
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
      })
    )
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

export async function uploadMap(request: UploadRequest, attemptsRemaining: number = 0): Promise<boolean> {
  const { projectId, mappingFile, obfuscatedFilePath, bucketName, appVersion, options } = request;
  const filePath = path.relative(options.projectRoot ?? process.cwd(), mappingFile);
  const obfuscatedPath = path
    .relative(options.projectRoot ?? process.cwd(), obfuscatedFilePath)
    .split(path.sep)
    .map((p) => (p === ".next" ? "_next" : p))
    // TODO(andrewbrook): add flag to allow uploading dev maps
    .filter((p) => p !== "dev")
    .join("/");
  const tmpArchive = await archiveFile(filePath, { archivedFileName: "mapping.js.map" });
  const gcsFile = `${options.app}-${appVersion}-${normalizeFileName(obfuscatedPath)}.zip`;
  const uid = murmurHashV3(`${options.app!}-${appVersion}-${obfuscatedPath}`);
  const name = `projects/${projectId}/locations/global/mappingFiles/${uid}`;

  const stream = fs.createReadStream(tmpArchive);
  stream.on("error", (err) => {
    logger.debug(`Stream error on tmpArchive: ${err}`);
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
      appId: options.app!,
      version: appVersion,
      obfuscatedFilePath: `/${obfuscatedPath}`,
      fileUri,
    });
    logger.debug(`Registered mapping file ${filePath}`);

    return true;
  } catch (e) {
    if (attemptsRemaining === 0) {
      logLabeledWarning("crashlytics", `Failed to upload mapping file ${filePath}:\n${e}`);
    }
    return false;
  } finally {
    stream.destroy();
    try {
      fs.rmSync(tmpArchive, { force: true });
    } catch (err) {
      logger.debug(`Failed to delete temporary archive ${tmpArchive}: ${err}`);
    }
  }
}

export function normalizeFileName(fileName: string): string {
  return fileName.replaceAll(/\//g, "-");
}

export async function registerSourceMap(sourceMap: SourceMap): Promise<void> {
  const client = new Client({
    urlPrefix: "https://firebasetelemetryadmin.googleapis.com",
    auth: true,
    apiVersion: "v1",
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
      `Failed to register source map ${sourceMap.obfuscatedFilePath} with Firebase Telemetry service:\n${e}`,
    );
  }
}
