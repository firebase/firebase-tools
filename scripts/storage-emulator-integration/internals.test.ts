import * as puppeteer from "puppeteer";
import { expect } from "chai";
import * as admin from "firebase-admin";
import { Bucket } from "@google-cloud/storage";
import * as http from "http";
import * as firebase from "firebase";
import { TriggerEndToEndTest } from "../integration-helpers/framework";
import * as fs from "fs";
import * as path from "path";
import {
  createRandomFile,
  EMULATORS_SHUTDOWN_DELAY_MS,
  getAuthEmulatorHost,
  getStorageEmulatorHost,
  readEmulatorConfig,
  readJson,
  resetStorageEmulator,
  SERVICE_ACCOUNT_KEY,
  SMALL_FILE_SIZE,
  TEST_SETUP_TIMEOUT,
  uploadText,
} from "./utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

const EMULATOR_CONFIG = readEmulatorConfig();
const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(EMULATOR_CONFIG);
const AUTH_EMULATOR_HOST = getAuthEmulatorHost(EMULATOR_CONFIG);

// Emulators accept fake app configs. This is sufficient for testing against the emulator.
const FAKE_APP_CONFIG = {
  apiKey: "fake-api-key",
  projectId: `${FIREBASE_PROJECT}`,
  authDomain: `${FIREBASE_PROJECT}.firebaseapp.com`,
  storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
  appId: "fake-app-id",
};

const storageBucket = FAKE_APP_CONFIG.storageBucket;

describe("Emulator Internals", function (this) {
  // Temp directory to store generated files.
  let tmpDir: string;
  let test: TriggerEndToEndTest;
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TEST_SETUP_TIMEOUT);

  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  let testGcsBucket: Bucket;

  before(async () => {
    this.timeout(TEST_SETUP_TIMEOUT);

    // Start emulators
    process.env.STORAGE_EMULATOR_HOST = STORAGE_EMULATOR_HOST;
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, EMULATOR_CONFIG);
    await test.startEmulators(["--only", "auth,storage"]);

    // Initialize GCS SDK
    const adminCredential = fs.existsSync(path.join(__dirname, SERVICE_ACCOUNT_KEY))
      ? admin.credential.cert(readJson(SERVICE_ACCOUNT_KEY))
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential: adminCredential });

    testGcsBucket = admin.storage().bucket(storageBucket);
  });

  const initFirebaseSdkPage = async () => {
    const browser = await puppeteer.launch({
      devtools: true,
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "networkidle2" });

    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/7.24.0/firebase-app.js",
    });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/7.24.0/firebase-auth.js",
    });
    await page.addScriptTag({
      url: "https://storage.googleapis.com/fir-tools-builds/firebase-storage.js",
    });

    await page.evaluate(
      (appConfig, emulatorHost) => {
        firebase.initializeApp(appConfig);
        const auth = firebase.auth();
        auth.useEmulator(emulatorHost);
        (window as any).auth = auth;
      },
      FAKE_APP_CONFIG,
      AUTH_EMULATOR_HOST
    );

    await page.evaluate((hostAndPort) => {
      const [host, port] = hostAndPort.split(":") as string[];
      (firebase.storage() as any).useEmulator(host, port);
    }, STORAGE_EMULATOR_HOST.replace(/^(https?:|)\/\//, ""));
    return { browser, page };
  };

  beforeEach(async () => {
    await resetStorageEmulator(STORAGE_EMULATOR_HOST);
    ({ browser, page } = await initFirebaseSdkPage());
  });

  this.afterEach(async () => {
    await page.close();
    await browser.close();
  });

  after(async () => {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);

    if (tmpDir) {
      fs.rmdirSync(tmpDir, { recursive: true });
    }
    delete process.env.STORAGE_EMULATOR_HOST;
    await test.stopEmulators();
  });

  it("gcloud API persisted files should be accessible via Firebase SDK", async () => {
    const smallFilePath = createRandomFile("testFile", SMALL_FILE_SIZE);
    await testGcsBucket.upload(smallFilePath, { destination: "public/testFile" });

    const downloadUrl = await page.evaluate(() => {
      return firebase.storage().ref("public/testFile").getDownloadURL();
    });
    const requestClient = http;
    const data = await new Promise((resolve, reject) => {
      requestClient.get(downloadUrl, (response) => {
        const bufs: any = [];
        response
          .on("data", (chunk) => bufs.push(chunk))
          .on("end", () => resolve(Buffer.concat(bufs)))
          .on("close", resolve)
          .on("error", reject);
      });
    });

    expect(data).to.deep.equal(fs.readFileSync(smallFilePath));
  });

  it("Firebase SDK persisted files should be accessible via gcloud API", async () => {
    const fileContent = "some-file-content";
    await uploadText(page, "public/testFile", fileContent);

    const [downloadedFileContent] = await testGcsBucket.file("public/testFile").download();
    expect(downloadedFileContent).to.deep.equal(Buffer.from(fileContent));
  });
});
