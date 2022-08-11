import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import * as supertest from "supertest";
import { IMAGE_FILE_BASE64 } from "../../../src/test/emulators/fixtures";
import { TriggerEndToEndTest } from "../../integration-helpers/framework";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  getStorageEmulatorHost,
  readEmulatorConfig,
  readJson,
  readProdAppConfig,
  resetStorageEmulator,
  SERVICE_ACCOUNT_KEY,
  TEST_SETUP_TIMEOUT,
  writeToFile,
  getTmpDir,
} from "./utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

// Flip these flags for options during test debugging
// all should be FALSE on commit
const TEST_CONFIG = {
  // Set this to true to use production servers
  // (useful for writing tests against source of truth)
  useProductionServers: false,
};

// Emulators accept fake app configs. This is sufficient for testing against the emulator.
const FAKE_APP_CONFIG = {
  apiKey: "fake-api-key",
  projectId: `${FIREBASE_PROJECT}`,
  authDomain: `${FIREBASE_PROJECT}.firebaseapp.com`,
  storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
  appId: "fake-app-id",
};

const TEST_FILE_NAME = "testing/storage_ref/image.png";
const ENCODED_TEST_FILE_NAME = "testing%2Fstorage_ref%2Fimage.png";

// TODO(b/241151246): Fix conformance tests.
describe("Storage endpoint conformance tests", () => {
  let test: TriggerEndToEndTest;

  let testBucket: Bucket;

  // Temp directory to store generated files.
  let tmpDir: string = getTmpDir();
  const imageFilePath = writeToFile(
    "image_base64",
    Buffer.from(IMAGE_FILE_BASE64, "base64"),
    tmpDir
  );

  const appConfig = TEST_CONFIG.useProductionServers ? readProdAppConfig() : FAKE_APP_CONFIG;
  const storageBucket = appConfig.storageBucket;
  const emulatorConfig = readEmulatorConfig();
  const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(emulatorConfig);

  async function resetState(): Promise<void> {
    if (TEST_CONFIG.useProductionServers) {
      await testBucket.deleteFiles();
    } else {
      await resetStorageEmulator(STORAGE_EMULATOR_HOST);
    }
  }

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    if (TEST_CONFIG.useProductionServers) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, SERVICE_ACCOUNT_KEY);
    } else {
      process.env.STORAGE_EMULATOR_HOST = STORAGE_EMULATOR_HOST;
      test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, emulatorConfig);
      await test.startEmulators(["--only", "auth,storage"]);
    }

    const credential = fs.existsSync(path.join(__dirname, SERVICE_ACCOUNT_KEY))
      ? admin.credential.cert(readJson(SERVICE_ACCOUNT_KEY))
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);
  });

  beforeEach(async () => {
    await resetState();
    await testBucket.upload(imageFilePath, { destination: TEST_FILE_NAME });
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    if (TEST_CONFIG.useProductionServers) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    } else {
      delete process.env.STORAGE_EMULATOR_HOST;
      await test.stopEmulators();
    }
  });

  describe("tokens", () => {
    it("should generate new token on create_token", async () => {
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",").length).to.deep.equal(1);
        });
    });

    it("should return a 400 if create_token value is invalid", async () => {
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=someNonTrueParam`)
        .set({ Authorization: "Bearer owner" })
        .expect(400);
    });

    it("should return a 403 for create_token if auth header is invalid", async () => {
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer somethingElse" })
        .expect(403);
    });

    it("should delete a download token", async () => {
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200);
      const tokens = await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => res.body.downloadTokens.split(","));
      // delete the newly added token
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=${tokens[0]}`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",")).to.deep.equal([tokens[1]]);
        });
    });

    it("should regenerate a new token if the last remaining one is deleted", async () => {
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200);
      const token = await supertest(STORAGE_EMULATOR_HOST)
        .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => res.body.downloadTokens);

      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=${token}`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",").length).to.deep.equal(1);
          expect(metadata.downloadTokens.split(",")).to.not.deep.equal([token]);
        });
    });

    it("should return a 403 for delete_token if auth header is invalid", async () => {
      await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=someToken`)
        .set({ Authorization: "Bearer somethingElse" })
        .expect(403);
    });
  });

  it("should return an error message when uploading a file with invalid metadata", async () => {
    const fileName = "test_upload.jpg";
    const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
      .post(`/v0/b/${storageBucket}/o/?name=${fileName}`)
      .set({ "x-goog-upload-protocol": "multipart", "content-type": "foo" })
      .expect(400)
      .then((res) => res.body.error.message);

    expect(errorMessage).to.equal("Invalid Content-Type: foo");
  });

  it("should accept subsequent resumable upload commands without an auth header", async () => {
    const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
      .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({
        Authorization: "Bearer owner",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
      })
      .expect(200)
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(STORAGE_EMULATOR_HOST)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        // No Authorization required in upload
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload",
      })
      .expect(200);

    const uploadStatus = await supertest(STORAGE_EMULATOR_HOST)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        // No Authorization required in finalize
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      })
      .expect(200)
      .then((res) => res.header["x-goog-upload-status"]);

    expect(uploadStatus).to.equal("final");

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${storageBucket}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  it("should return 403 when resumable upload is unauthenticated", async () => {
    const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
      .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({
        // Authorization missing
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
      })
      .expect(200)
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(STORAGE_EMULATOR_HOST)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      })
      .expect(403);
  });

  describe("cancels upload", () => {
    it("should cancel upload successfully", async () => {
      const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(STORAGE_EMULATOR_HOST)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(200);

      await supertest(STORAGE_EMULATOR_HOST)
        .get(`/v0/b/${storageBucket}/o/test_upload.jpg`)
        .set({ Authorization: "Bearer owner" })
        .expect(404);
    });

    it("should return 200 when cancelling already cancelled upload", async () => {
      const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(STORAGE_EMULATOR_HOST)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(200);

      await supertest(STORAGE_EMULATOR_HOST)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(200);
    });

    it("should return 400 when cancelling finalized resumable upload", async () => {
      const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(STORAGE_EMULATOR_HOST)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "upload, finalize",
        })
        .expect(200);

      await supertest(STORAGE_EMULATOR_HOST)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(400);
    });

    it("should return 404 when cancelling non-existent upload", async () => {
      const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(STORAGE_EMULATOR_HOST)
        .put(uploadURL.pathname + uploadURL.search.replace(/(upload_id=).*?(&)/, "$1foo$2"))
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(404);
    });
  });
});
