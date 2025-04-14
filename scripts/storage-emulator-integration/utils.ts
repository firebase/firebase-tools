import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";
import * as crypto from "crypto";
import * as os from "os";
import { FrameworkOptions } from "../integration-helpers/framework";
const { google } = require("googleapis");

/* Various delays needed when integration test spawns parallel emulator subprocesses. */
export const TEST_SETUP_TIMEOUT = 60000;
export const EMULATORS_SHUTDOWN_DELAY_MS = 5000;
export const SMALL_FILE_SIZE = 200 * 1024; /* 200 kB */
// Firebase Emulator config, for starting up emulators
export const FIREBASE_EMULATOR_CONFIG = "firebase.json";

export function readEmulatorConfig(config = FIREBASE_EMULATOR_CONFIG): FrameworkOptions {
  try {
    return readJson(config);
  } catch (error) {
    throw new Error(
      `Cannot read the emulator config. Please ensure that the file ${config} is present in the current directory.`,
    );
  }
}

export function getStorageEmulatorHost(emulatorConfig: FrameworkOptions) {
  const port = emulatorConfig.emulators?.storage?.port;
  if (port) {
    return `http://127.0.0.1:${port}`;
  }
  throw new Error("Storage emulator config not found or invalid");
}

export function getAuthEmulatorHost(emulatorConfig: FrameworkOptions) {
  const port = emulatorConfig.emulators?.auth?.port;
  if (port) {
    return `http://127.0.0.1:${port}`;
  }
  throw new Error("Auth emulator config not found or invalid");
}

/**
 * Reads a JSON file in the current directory.
 *
 * @param filename name of the JSON file to be read. Must be in the current directory.
 */
export function readJson(filename: string) {
  return JSON.parse(readFile(filename));
}

export function readAbsoluteJson(filename: string) {
  return JSON.parse(readAbsoluteFile(filename));
}

export function readFile(filename: string): string {
  const fullPath = path.join(__dirname, filename);
  return readAbsoluteFile(fullPath);
}
export function readAbsoluteFile(filename: string): string {
  if (!fs.existsSync(filename)) {
    throw new Error(`Can't find file at ${filename}`);
  }
  return fs.readFileSync(filename, "utf8");
}

export function getTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "storage-files"));
}

export function createRandomFile(filename: string, sizeInBytes: number, tmpDir: string): string {
  return writeToFile(filename, crypto.randomBytes(sizeInBytes), tmpDir);
}

export function writeToFile(filename: string, contents: Buffer, tmpDir: string): string {
  const fullPath = path.join(tmpDir, filename);
  fs.writeFileSync(fullPath, contents);
  return fullPath;
}

/**
 * Resets the storage layer of the Storage Emulator.
 */
export async function resetStorageEmulator(emulatorHost: string) {
  await fetch(`${emulatorHost}/internal/reset`, { method: "POST" });
}

export async function getProdAccessToken(serviceAccountKey: any): Promise<string> {
  const jwtClient = new google.auth.JWT(
    serviceAccountKey.client_email,
    null,
    serviceAccountKey.private_key,
    ["https://www.googleapis.com/auth/cloud-platform"],
    null,
  );
  const credentials = await jwtClient.authorize();
  return credentials.access_token!;
}
