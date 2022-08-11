import { readJson } from "./utils";
import * as path from "path";
import { FrameworkOptions } from "../../integration-helpers/framework";
import { _topicWithOptions } from "firebase-functions/v1/pubsub";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";

// Flip these flags for options during test debugging
// all should be FALSE on commit
const TEST_CONFIG = {
  // Set this to true to use production servers
  // (useful for writing tests against source of truth)
  useProductionServers: false,

  prodAppConfigFilePath: "",
  prodServiceAccountKeyFilePath: "",

  emulatorConfigFilePath: "firebase.json",

  // Set this to true to make the headless chrome window visible
  // (useful for ensuring the browser is running as expected)
  showBrowser: false,
};

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

// Emulators accept fake app configs. This is sufficient for testing against the emulator.
const FAKE_APP_CONFIG = {
  apiKey: "fake-api-key",
  projectId: `${FIREBASE_PROJECT}`,
  authDomain: `${FIREBASE_PROJECT}.firebaseapp.com`,
  storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
  appId: "fake-app-id",
};

function readProdAppConfig() {
  const filePath = path.join(__dirname, TEST_CONFIG.prodAppConfigFilePath);
  try {
    return readJson(TEST_CONFIG.prodAppConfigFilePath);
  } catch (error) {
    throw new Error(`Cannot read the prod app config file. Please ensure that ${filePath} exists.`);
  }
}

function readEmulatorConfig(): FrameworkOptions {
  const filePath = path.join(__dirname, TEST_CONFIG.emulatorConfigFilePath);
  try {
    return readJson(TEST_CONFIG.emulatorConfigFilePath);
  } catch (error) {
    throw new Error(`Cannot read the emulator config. Please ensure that ${filePath} exists.`);
  }
}

class ConformanceTestEnvironment {
  private _prodAppConfig: any;
  private _emulatorConfig: any;
  private _prodServiceAccountKeyJson?: any;
  get useProductionServers() {
    return TEST_CONFIG.useProductionServers;
  }

  get showBrowser() {
    return TEST_CONFIG.showBrowser;
  }
  get projectId() {
    return FIREBASE_PROJECT;
  }

  private get prodAppConfig() {
    return this._prodAppConfig || (this._prodAppConfig = readProdAppConfig());
  }

  get appConfig() {
    return TEST_CONFIG.useProductionServers ? this.prodAppConfig : FAKE_APP_CONFIG;
  }

  get emulatorConfig() {
    return this._emulatorConfig || (this._emulatorConfig = readEmulatorConfig());
  }

  get storageEmulatorHost() {
    const port = this.emulatorConfig.emulators?.storage?.port;
    if (port) {
      return `http://localhost:${port}`;
    }
    throw new Error("Storage emulator config not found or invalid");
  }

  get authEmulatorHost() {
    const port = this.emulatorConfig.emulators?.auth?.port;
    if (port) {
      return `http://localhost:${port}`;
    }
    throw new Error("Auth emulator config not found or invalid");
  }

  get firebaseHost() {
    return this.useProductionServers
      ? "https://firebasestorage.googleapis.com"
      : this.storageEmulatorHost;
  }

  get prodServiceAccountKeyJson() {
    if (this._prodServiceAccountKeyJson === undefined) {
        const filePath = path.join(__dirname, TEST_CONFIG.prodServiceAccountKeyFilePath);
        return TEST_CONFIG.prodServiceAccountKeyFilePath && fs.existsSync(filePath)
          ? readJson(TEST_CONFIG.prodServiceAccountKeyFilePath)
          : null;
    }
    return this._prodServiceAccountKeyJson;
  }

  get requestClient() {
    return this.useProductionServers ? https : http;
  }

  applyEnvVars() {
    if (this.useProductionServers) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(
        __dirname,
        TEST_CONFIG.prodServiceAccountKeyFilePath
      );
    } else {
      process.env.STORAGE_EMULATOR_HOST = this.storageEmulatorHost;
    }
  }

  removeEnvVars() {
    if (this.useProductionServers) {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      } else {
        delete process.env.STORAGE_EMULATOR_HOST;
      }
  }
}

export const TEST_ENV = new ConformanceTestEnvironment();
