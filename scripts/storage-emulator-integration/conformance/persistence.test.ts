import * as puppeteer from "puppeteer";
import { expect } from "chai";
import * as admin from "firebase-admin";
import { Bucket } from "@google-cloud/storage";
import firebasePkg from "firebase/compat/app";
import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import * as fs from "fs";
import { TEST_ENV } from "./env";
import {
  createRandomFile,
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  SMALL_FILE_SIZE,
  TEST_SETUP_TIMEOUT,
  getTmpDir,
} from "../utils";

const TEST_FILE_NAME = "public/testFile";

// This is a 'workaround' to prevent typescript from renaming the import. That
// causes issues when page.evaluate is run with the rename, since the renamed
// values don't exist in the created page.
const firebase = firebasePkg;

// Tests files uploaded from one SDK are available in others.
describe("Storage persistence conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);

  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  let testBucket: Bucket;
  let test: EmulatorEndToEndTest;

  async function resetState(): Promise<void> {
    if (TEST_ENV.useProductionServers) {
      await testBucket.deleteFiles();
    } else {
      await resetStorageEmulator(TEST_ENV.storageEmulatorHost);
    }
  }

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    TEST_ENV.applyEnvVars();
    if (!TEST_ENV.useProductionServers) {
      test = new EmulatorEndToEndTest(TEST_ENV.fakeProjectId, __dirname, TEST_ENV.emulatorConfig);
      await test.startEmulators(["--only", "auth,storage"]);
    }

    // Init GCS admin SDK.
    const credential = TEST_ENV.prodServiceAccountKeyJson
      ? admin.credential.cert(TEST_ENV.prodServiceAccountKeyJson)
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(TEST_ENV.appConfig.storageBucket);

    // Init fake browser page.
    browser = await puppeteer.launch({
      headless: !TEST_ENV.showBrowser,
      devtools: true,
    });
    page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "networkidle2" });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/9.9.1/firebase-app-compat.js",
    });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/9.9.1/firebase-auth-compat.js",
    });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/9.9.1/firebase-storage-compat.js",
    });

    // Init Firebase app in browser context and maybe set emulator host overrides.
    await page.evaluate(
      (appConfig, useProductionServers, authEmulatorHost, storageEmulatorHost) => {
        firebase.initializeApp(appConfig);
        if (!useProductionServers) {
          firebase.auth().useEmulator(authEmulatorHost);
          const [storageHost, storagePort] = storageEmulatorHost.split(":") as string[];
          (firebase.storage() as any).useEmulator(storageHost, storagePort);
        }
      },
      TEST_ENV.appConfig,
      TEST_ENV.useProductionServers,
      TEST_ENV.authEmulatorHost,
      TEST_ENV.storageEmulatorHost.replace(/^(https?:|)\/\//, ""),
    );
  });

  beforeEach(async () => {
    await resetState();
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    admin.app().delete();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await page.close();
    await browser.close();

    TEST_ENV.removeEnvVars();
    if (!TEST_ENV.useProductionServers) {
      await test.stopEmulators();
    }
  });

  it("gcloud API persisted files should be accessible via Firebase SDK", async () => {
    await testBucket.upload(smallFilePath, { destination: TEST_FILE_NAME });

    const downloadUrl = await page.evaluate((testFileName) => {
      return firebase.storage().ref(testFileName).getDownloadURL();
    }, TEST_FILE_NAME);
    const data = await new Promise((resolve, reject) => {
      TEST_ENV.requestClient.get(downloadUrl, (response) => {
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
    await page.evaluate(
      async (testFileName, fileContent) => {
        await firebase.storage().ref(testFileName).putString(fileContent);
      },
      TEST_FILE_NAME,
      fileContent,
    );

    const [downloadedFileContent] = await testBucket.file(TEST_FILE_NAME).download();
    expect(downloadedFileContent).to.deep.equal(Buffer.from(fileContent));
  });
});
