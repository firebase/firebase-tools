import * as fs from "fs-extra";
import * as path from "path";
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
  const safeTestCase = testCaseName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeVariant = variantId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, "recordings", safeTestCase, `${safeVariant}.json`);
}

/**
 * Saves a variant recording to the cache.
 */
export async function saveRecording(recording: VariantRecording): Promise<void> {
  const filePath = getRecordingPath(recording.testCaseName, recording.id);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, recording, { spaces: 2 });
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
  const testCases = await fs.readdir(recordingsDir);
  for (const tc of testCases) {
    const tcDir = path.join(recordingsDir, tc);
    const stat = await fs.stat(tcDir);
    if (stat.isDirectory()) {
      const files = await fs.readdir(tcDir);
      result[tc] = files
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.replace(/\.json$/, ""));
    }
  }

  return result;
}
