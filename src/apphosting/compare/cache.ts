import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { logger } from "../../logger";

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  isBinary: boolean;
}

export interface VariantRecording {
  id: string;
  testCaseName: string;
  timestamp: string;
  url: string;
  routes: Record<string, RouteResponse>;
}

const CACHE_DIR = path.resolve(process.cwd(), "compare-cache");

function getRecordingPath(testCaseName: string, variantId: string): string {
  const tcHash = crypto.createHash("sha256").update(testCaseName).digest("hex").slice(0, 8);
  const vHash = crypto.createHash("sha256").update(variantId).digest("hex").slice(0, 8);
  const safeTestCase = `${testCaseName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${tcHash}`;
  const safeVariant = `${variantId.replace(/[^a-zA-Z0-9_-]/g, "_")}_${vHash}`;
  return path.join(CACHE_DIR, "recordings", safeTestCase, `${safeVariant}.json`);
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
  return await fs.readJson(filePath);
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
        if (stat.isDirectory()) {
          const files = await fs.readdir(tcDir);
          const jsonFiles = files.filter((file) => file.endsWith(".json"));
          if (jsonFiles.length > 0) {
            const variantIds: string[] = [];
            let originalTestCaseName = "";
            for (const file of jsonFiles) {
              try {
                const data = await fs.readJson(path.join(tcDir, file));
                originalTestCaseName = data.testCaseName || tc;
                variantIds.push(data.id || file.replace(/\.json$/, ""));
              } catch (readErr) {
                // If a file is partially written or corrupted, skip it
                logger.debug(`Failed to read metadata for cache file: ${file}`, readErr);
              }
            }
            if (originalTestCaseName && variantIds.length > 0) {
              result[originalTestCaseName] = variantIds;
            }
          }
        }
      } catch (err: any) {
        if (err.code === "ENOENT") {
          continue; // Directory was concurrently deleted/moved
        }
        throw err;
      }
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return {};
    }
    throw err;
  }

  return result;
}

