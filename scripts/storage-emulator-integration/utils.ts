import * as firebase from "firebase";
import * as fs from "fs";
import * as path from "path";
import * as puppeteer from "puppeteer";
import * as request from "request";
import * as crypto from "crypto";
import * as os from "os";
import { FrameworkOptions } from "../integration-helpers/framework";

/* Various delays needed when integration test spawns parallel emulator subprocesses. */
export const TEST_SETUP_TIMEOUT = 60000;
export const EMULATORS_SHUTDOWN_DELAY_MS = 5000;

// Files contianing the Firebase App Config and Service Account key for
// the app to be used in these tests.This is only applicable if
// TEST_CONFIG.useProductionServers is true
export const PROD_APP_CONFIG = "storage-integration-config.json";
export const SERVICE_ACCOUNT_KEY = "service-account-key.json";

// Firebase Emulator config, for starting up emulators
export const FIREBASE_EMULATOR_CONFIG = "firebase.json";
export const SMALL_FILE_SIZE = 200 * 1024; /* 200 kB */
export const LARGE_FILE_SIZE = 20 * 1024 * 1024; /* 20 MiB */

/**
 * Reads a JSON file in the current directory.
 *
 * @param filename name of the JSON file to be read. Must be in the current directory.
 */
export function readJson(filename: string) {
  const fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Can't find file at ${filename}`);
  }
  const data = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(data);
}

export function readProdAppConfig() {
  try {
    return readJson(PROD_APP_CONFIG);
  } catch (error) {
    throw new Error(
      `Cannot read the integration config. Please ensure that the file ${PROD_APP_CONFIG} is present in the current directory.`
    );
  }
}

export function readEmulatorConfig(config = FIREBASE_EMULATOR_CONFIG): FrameworkOptions {
  try {
    return readJson(config);
  } catch (error) {
    throw new Error(
      `Cannot read the emulator config. Please ensure that the file ${config} is present in the current directory.`
    );
  }
}

export function getAuthEmulatorHost(emulatorConfig: FrameworkOptions) {
  const port = emulatorConfig.emulators?.auth?.port;
  if (port) {
    return `http://localhost:${port}`;
  }
  throw new Error("Auth emulator config not found or invalid");
}

export function getStorageEmulatorHost(emulatorConfig: FrameworkOptions) {
  const port = emulatorConfig.emulators?.storage?.port;
  if (port) {
    return `http://localhost:${port}`;
  }
  throw new Error("Storage emulator config not found or invalid");
}

export function createRandomFile(filename: string, sizeInBytes: number, tmpDir?: string): string {
  if (!tmpDir) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-files"));
  }
  const fullPath = path.join(tmpDir, filename);
  const bytes = crypto.randomBytes(sizeInBytes);
  fs.writeFileSync(fullPath, bytes);

  return fullPath;
}

/**
 * Resets the storage layer of the Storage Emulator.
 */
export async function resetStorageEmulator(emulatorHost: string) {
  await new Promise<void>((resolve) => {
    request.post(`${emulatorHost}/internal/reset`, () => {
      resolve();
    });
  });
}

export async function uploadText(
  page: puppeteer.Page,
  filename: string,
  text: string,
  format?: string,
  metadata?: firebase.storage.UploadMetadata
): Promise<string> {
  return page.evaluate(
    async (filename, text, format, metadata) => {
      try {
        const task = await firebase
          .storage()
          .ref(filename)
          .putString(text, format, JSON.parse(metadata));
        return task.state;
      } catch (err) {
        if (err instanceof Error) {
          throw err.message;
        }
        throw err;
      }
    },
    filename,
    text,
    format ?? "raw",
    JSON.stringify(metadata ?? {})
  )!;
}
