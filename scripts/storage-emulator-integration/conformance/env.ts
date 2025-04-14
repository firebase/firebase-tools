import {
  readAbsoluteJson,
  getProdAccessToken,
  getStorageEmulatorHost,
  getAuthEmulatorHost,
} from "../utils";
import * as path from "path";
import { FrameworkOptions } from "../../integration-helpers/framework";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";

// Set these flags to control test behavior.
const TEST_CONFIG = {
  // Set this to true to use production servers
  // (useful for writing tests against source of truth)
  useProductionServers: false,

  // The following two fields MUST be set if useProductionServers == true.
  // The paths should be relative to this file.
  //
  // Follow the instructions here to get your app config:
  // https://support.google.com/firebase/answer/7015592#web
  prodAppConfigFilePath: "storage-integration-config.json",
  // Follow the instructions here to create a service account key file:
  // https://firebase.google.com/docs/admin/setup#initialize-sdk
  prodServiceAccountKeyFilePath: "service-account-key.json",

  // Name of secondary GCS bucket used in tests that need two buckets.
  // When useProductionServers == true, this must be a bucket that
  // the prod service account has write access to.
  secondTestBucket: "other-bucket",

  // Relative path to the emulator config to use in integration tests.
  // Only used when useProductionServers == false.
  emulatorConfigFilePath: "../firebase.json",

  // Set this to true to make the headless chrome window used in
  // Firebase js sdk integration tests visible.
  showBrowser: false,
};

// Project id to use when testing against the emulator. Not used in prod
// conformance tests.
const FAKE_FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

// Emulators accept fake app configs. This is sufficient for testing against the emulator.
const FAKE_APP_CONFIG = {
  apiKey: "fake-api-key",
  projectId: `${FAKE_FIREBASE_PROJECT}`,
  authDomain: `${FAKE_FIREBASE_PROJECT}.firebaseapp.com`,
  storageBucket: `${FAKE_FIREBASE_PROJECT}.appspot.com`,
  appId: "fake-app-id",
};

function readProdAppConfig() {
  const filePath = path.join(__dirname, TEST_CONFIG.prodAppConfigFilePath);
  try {
    return readAbsoluteJson(filePath);
  } catch (error) {
    throw new Error(`Cannot read the prod app config file. Please ensure that ${filePath} exists.`);
  }
}

function readEmulatorConfig(): FrameworkOptions {
  const filePath = path.join(__dirname, TEST_CONFIG.emulatorConfigFilePath);
  try {
    return readAbsoluteJson(filePath);
  } catch (error) {
    throw new Error(`Cannot read the emulator config. Please ensure that ${filePath} exists.`);
  }
}

class ConformanceTestEnvironment {
  private _prodAppConfig: any;
  private _emulatorConfig: any;
  private _prodServiceAccountKeyJson?: any | null;
  private _adminAccessToken?: string;

  get useProductionServers() {
    return TEST_CONFIG.useProductionServers;
  }

  get showBrowser() {
    return TEST_CONFIG.showBrowser;
  }
  get fakeProjectId() {
    return FAKE_FIREBASE_PROJECT;
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
    return getStorageEmulatorHost(this.emulatorConfig);
  }

  get authEmulatorHost() {
    return getAuthEmulatorHost(this.emulatorConfig);
  }

  get firebaseHost() {
    return this.useProductionServers
      ? "https://firebasestorage.googleapis.com"
      : this.storageEmulatorHost;
  }

  get storageHost() {
    return this.useProductionServers ? "https://storage.googleapis.com" : this.storageEmulatorHost;
  }

  get googleapisHost() {
    return this.useProductionServers ? "https://www.googleapis.com" : this.storageEmulatorHost;
  }

  get prodServiceAccountKeyJson() {
    if (this._prodServiceAccountKeyJson === undefined) {
      const filePath = path.join(__dirname, TEST_CONFIG.prodServiceAccountKeyFilePath);
      this._prodServiceAccountKeyJson =
        TEST_CONFIG.prodServiceAccountKeyFilePath && fs.existsSync(filePath)
          ? readAbsoluteJson(filePath)
          : null;
    }
    return this._prodServiceAccountKeyJson;
  }

  get requestClient() {
    return this.useProductionServers ? https : http;
  }

  get adminAccessTokenGetter(): Promise<string> {
    if (this._adminAccessToken) {
      return Promise.resolve(this._adminAccessToken);
    }
    const generateAdminAccessToken = this.useProductionServers
      ? getProdAccessToken(this.prodServiceAccountKeyJson)
      : Promise.resolve("owner");
    return generateAdminAccessToken.then((token) => {
      this._adminAccessToken = token;
      return token;
    });
  }

  get secondTestBucket() {
    return TEST_CONFIG.secondTestBucket;
  }

  applyEnvVars() {
    if (this.useProductionServers) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(
        __dirname,
        TEST_CONFIG.prodServiceAccountKeyFilePath,
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
