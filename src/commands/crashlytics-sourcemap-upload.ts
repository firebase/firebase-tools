import * as fs from "fs";
import * as path from "path";
import { statSync } from "fs-extra";
import { readdirRecursive } from "../fsAsync";
import { Command } from "../command";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { commandExistsSync, logLabeledBullet, logLabeledWarning } from "../utils";
import { needProjectId } from "../projectUtils";
import * as gcs from "../gcp/storage";
import { getProjectNumber } from "../getProjectNumber";
import { Options } from "../options";
import { archiveFile } from "../archiveFile";
import { execSync } from "node:child_process";
import { Client } from "../apiv2";
import { murmurHashV3 } from "murmurhash-es";

interface CommandOptions extends Options {
  app?: string;
  bucketLocation?: string;
  appVersion?: string;
}

interface SourceMap {
  name: string;
  appId: string;
  version: string;
  obfuscatedFilePath: string;
  fileUri: string;
}

interface SourceMapMapping {
  mapFilePath: string;
  obfuscatedFilePath: string;
}

export const command = new Command("crashlytics:sourcemap:upload [mappingFiles]")
  .description("upload javascript source maps to de-minify stack traces")
  .option("--app <appID>", "the app id of your Firebase app")
  .option(
    "--bucket-location <bucketLocation>",
    'the location of the Google Cloud Storage bucket (default: "US-CENTRAL1"',
  )
  .option(
    "--app-version <appVersion>",
    "the version of your Firebase app (defaults to Git commit hash, if available)",
  )
  .action(async (mappingFiles: string | undefined, options: CommandOptions) => {
    checkGoogleAppID(options);

    // App version
    const appVersion = getAppVersion(options);

    // Get project identifiers
    const projectId = needProjectId(options);
    const projectNumber = await getProjectNumber(options);

    // Upsert default GCS bucket
    const bucketName = await upsertBucket(projectId, projectNumber, options);

    // Find and upload mapping files
    const rootDir = path.resolve(options.projectRoot ?? process.cwd());
    const filePath = path.relative(rootDir, path.resolve(mappingFiles || ".")) || ".";
    let fstat: fs.Stats;
    try {
      fstat = statSync(filePath);
    } catch (e) {
      throw new FirebaseError(
        "provide a valid file path or directory to mapping file(s), e.g. app/build/outputs/app.js.map or app/build/outputs",
      );
    }
    let successCount = 0;
    const failedFiles: string[] = [];
    if (fstat.isFile()) {
      const success = await uploadMap(
        projectId,
        filePath,
        filePath,
        bucketName,
        appVersion,
        options,
      );
      if (success) {
        successCount++;
      } else {
        failedFiles.push(filePath);
      }
    } else if (fstat.isDirectory()) {
      logLabeledBullet("crashlytics", "Looking for mapping files in your directory...");
      const files = await readdirRecursive({
        path: filePath,
        ignore: ["node_modules", ".git"],
        maxDepth: 20,
      });

      const mappings = findSourceMapMappings(files, rootDir);

      const results = await Promise.all(
        mappings.map((mapping) =>
          uploadMap(
            projectId,
            mapping.mapFilePath,
            mapping.obfuscatedFilePath,
            bucketName,
            appVersion,
            options,
          ),
        ),
      );

      results.forEach((success, i) => {
        if (success) {
          successCount++;
        } else {
          failedFiles.push(mappings[i].mapFilePath);
        }
      });
    } else {
      throw new FirebaseError(
        "provide a valid file path or directory to mapping file(s), e.g. app/build/outputs/app.js.map or app/build/outputs",
      );
    }
    logLabeledBullet(
      "crashlytics",
      `Uploaded ${successCount} (${failedFiles.length} failed) mapping files to ${bucketName}`,
    );
    if (failedFiles.length > 0) {
      logLabeledBullet(
        "crashlytics",
        `Could not upload the following files:\n${failedFiles.join("\n")}`,
      );
    }
  });

function findSourceMapMappings(files: { name: string }[], rootDir: string): SourceMapMapping[] {
  const jsFiles = files.filter((f) => f.name.endsWith(".js"));
  const mapFiles = files.filter((f) => f.name.endsWith(".js.map"));

  const mappings: SourceMapMapping[] = [];
  const mapFilePathsSet = new Set(mapFiles.map((f) => f.name));
  // Set to track map files that were linked from a JS file (via `sourceMappingURL` comment)
  const mapFilesLinkedInJsComment = new Set<string>();

  for (const jsFile of jsFiles) {
    const mapFilePath = getLinkedSourceMapPath(jsFile.name);
    if (mapFilePath && mapFilePathsSet.has(mapFilePath)) {
      mappings.push({
        mapFilePath,
        obfuscatedFilePath: path.relative(rootDir, path.resolve(`${jsFile.name}.map`)),
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

function getLinkedSourceMapPath(jsFilePath: string): string | undefined {
  const jsContent = fs.readFileSync(jsFilePath, "utf-8");
  const match = jsContent.match(/^\/\/\s*[#@]\s*sourceMappingURL=(.+)\s*$/m);
  if (match) {
    const sourceMappingURL = match[1].trim();
    return path.join(path.dirname(jsFilePath), sourceMappingURL);
  }
  return undefined;
}

function checkGoogleAppID(options: CommandOptions): void {
  if (!options.app) {
    throw new FirebaseError(
      "set --app <appId> to a valid Firebase application id, e.g. 1:00000000:android:0000000",
    );
  }
}

function getAppVersion(options: CommandOptions): string {
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

async function upsertBucket(
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

async function uploadMap(
  projectId: string,
  mappingFile: string,
  obfuscatedFilePath: string,
  bucketName: string,
  appVersion: string,
  options: CommandOptions,
): Promise<boolean> {
  const filePath = path.relative(options.projectRoot ?? process.cwd(), mappingFile);
  const obfuscatedPath = path.relative(options.projectRoot ?? process.cwd(), obfuscatedFilePath);
  const tmpArchive = await archiveFile(filePath, { archivedFileName: "mapping.js.map" });
  const gcsFile = `${options.app}-${appVersion}-${normalizeFileName(obfuscatedPath)}.zip`;
  const uid = murmurHashV3(`${options.app!}-${appVersion}-${obfuscatedPath}`);
  const name = `projects/${projectId}/locations/global/mappingFiles/${uid}`;

  try {
    const { bucket, object } = await gcs.uploadObject(
      {
        file: gcsFile,
        stream: fs.createReadStream(tmpArchive),
      },
      bucketName,
    );
    const fileUri = `gs://${bucket}/${object}`;
    logger.debug(`Uploaded mapping file ${filePath} to ${fileUri}`);

    await registerSourceMap({
      name,
      appId: options.app!,
      version: appVersion,
      obfuscatedFilePath: obfuscatedPath,
      fileUri,
    });

    return true;
  } catch (e) {
    logLabeledWarning("crashlytics", `Failed to upload mapping file ${filePath}:\n${e}`);
    return false;
  }
}

function normalizeFileName(fileName: string): string {
  return fileName.replaceAll(/\//g, "-");
}

async function registerSourceMap(sourceMap: SourceMap): Promise<void> {
  const client = new Client({
    // TODO(tonybaroneee): use the real telemetry server url when ready
    urlPrefix: "http://localhost",
    auth: true,
    apiVersion: "v1",
  });

  try {
    await client.patch(sourceMap.name, sourceMap, { queryParams: { allowMissing: "true" } });
    logger.debug(
      `Registered source map ${sourceMap.obfuscatedFilePath} with Firebase Telemetry service`,
    );
  } catch (e) {
    throw new FirebaseError(
      `Failed to register source map ${sourceMap.obfuscatedFilePath} with Firebase Telemetry service:\n${e}`,
    );
  }
}

function getGitCommit(): string | undefined {
  if (!commandExistsSync("git")) {
    return undefined;
  }
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch (error) {
    return undefined;
  }
}

function getPackageVersion(): string | undefined {
  if (!commandExistsSync("npm")) {
    return undefined;
  }
  try {
    return execSync("npm pkg get version").toString().trim().replaceAll('"', "");
  } catch (error) {
    return undefined;
  }
}
