import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { logger } from "../../logger";

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  isBinary: boolean;
  latencyMs?: number;
}

export interface VariantRecording {
  id: string;
  testCaseName: string;
  timestamp: string;
  url: string;
  routes: Record<string, RouteResponse>;
  localBuild?: boolean;
  runtime?: string;
  deployTimeMs?: number;
}

export function isRouteResponse(obj: unknown): obj is RouteResponse {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  
  if (!(
    typeof o.status === "number" &&
    typeof o.headers === "object" && o.headers !== null &&
    typeof o.body === "string" &&
    typeof o.isBinary === "boolean"
  )) {
    return false;
  }

  if (o.latencyMs !== undefined && typeof o.latencyMs !== "number") {
    return false;
  }

  return true;
}

export function isVariantRecording(obj: unknown): obj is VariantRecording {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  
  if (!(
    typeof o.id === "string" &&
    typeof o.testCaseName === "string" &&
    typeof o.timestamp === "string" &&
    typeof o.url === "string" &&
    typeof o.routes === "object" && o.routes !== null
  )) {
    return false;
  }

  if (o.localBuild !== undefined && typeof o.localBuild !== "boolean") {
    return false;
  }

  if (o.runtime !== undefined && typeof o.runtime !== "string") {
    return false;
  }

  if (o.deployTimeMs !== undefined && typeof o.deployTimeMs !== "number") {
    return false;
  }

  const routes = o.routes as Record<string, unknown>;
  for (const key of Object.keys(routes)) {
    if (!isRouteResponse(routes[key])) {
      return false;
    }
  }

  return true;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

const CACHE_DIR = path.resolve(process.cwd(), "compare-cache");

function getRecordingPath(testCaseName: string, variantId: string): string {
  const tcHash = crypto.createHash("sha256").update(testCaseName).digest("hex").slice(0, 8);
  const vHash = crypto.createHash("sha256").update(variantId).digest("hex").slice(0, 8);
  const safeTestCase = `${testCaseName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${tcHash}`;
  const safeVariant = `${variantId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${vHash}`;
  const resolvedPath = path.resolve(path.join(CACHE_DIR, "recordings", safeTestCase, `${safeVariant}.json`));
  
  if (!resolvedPath.startsWith(path.resolve(CACHE_DIR))) {
    throw new Error("Path traversal restriction violation");
  }
  return resolvedPath;
}

/**
 * Saves a variant recording to the cache atomically.
 */
export async function saveRecording(recording: VariantRecording): Promise<void> {
  const filePath = getRecordingPath(recording.testCaseName, recording.id);
  const tempPath = filePath + ".tmp";
  
  await fs.ensureDir(path.dirname(tempPath));
  await fs.writeJson(tempPath, recording, { spaces: 2 });
  await fs.rename(tempPath, filePath);
  
  logger.info(`Saved recording to cache: ${filePath}`);
}

/**
 * Loads a variant recording from the cache.
 */
export async function loadRecording(testCaseName: string, variantId: string): Promise<VariantRecording> {
  const filePath = getRecordingPath(testCaseName, variantId);
  if (!(await fs.pathExists(filePath))) {
    throw new Error(`No recording found in cache for variant "${variantId}" under test case "${testCaseName}"`);
  }
  const data = await fs.readJson(filePath);
  if (!isVariantRecording(data)) {
    throw new Error(`Invalid recording format in cache for variant "${variantId}" under test case "${testCaseName}"`);
  }
  return data;
}

/**
 * Lists all recorded test cases and their variants.
 */
export async function listRecordings(): Promise<Record<string, string[]>> {
  const recordingsDir = path.join(CACHE_DIR, "recordings");
  if (!(await fs.pathExists(recordingsDir))) {
    return {};
  }

  const result: Record<string, string[]> = {};
  try {
    const testCases = await fs.readdir(recordingsDir);
    for (const tc of testCases) {
      const tcDir = path.join(recordingsDir, tc);
      try {
        const stat = await fs.stat(tcDir);
        if (!stat.isDirectory()) {
          continue;
        }
        const files = await fs.readdir(tcDir);
        const jsonFiles = files.filter((file) => file.endsWith(".json"));
        if (jsonFiles.length === 0) {
          continue;
        }
        const variantIds: string[] = [];
        let originalTestCaseName = "";
        for (const file of jsonFiles) {
          try {
            const data = await fs.readJson(path.join(tcDir, file));
            if (isVariantRecording(data)) {
              originalTestCaseName = data.testCaseName;
              variantIds.push(data.id);
            } else {
              logger.debug(`Cache file ${file} does not match VariantRecording schema`);
            }
          } catch (readErr) {
            // If a file is partially written or corrupted, skip it
            logger.debug(`Failed to read metadata for cache file: ${file}`, readErr);
          }
        }
        if (originalTestCaseName && variantIds.length > 0) {
          result[originalTestCaseName] = variantIds;
        }
      } catch (err: unknown) {
        if (isErrnoException(err) && err.code === "ENOENT") {
          continue; // Directory was concurrently deleted/moved
        }
        throw err;
      }
    }
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      return {};
    }
    throw err;
  }

  return result;
}


