import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as supertest from "supertest";
import { TEST_ENV } from "./env";

import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import {
  createRandomFile,
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  getTmpDir,
  SMALL_FILE_SIZE,
  TEST_SETUP_TIMEOUT,
} from "../utils";

const TEST_FILE_NAME = "testing/storage_ref/image.png";
const ENCODED_TEST_FILE_NAME = "testing%2Fstorage_ref%2Fimage.png";

// TODO(b/241151246): Fix conformance tests.
// TODO(b/242314185): add more coverage.
describe("Firebase Storage endpoint conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);

  const firebaseHost = TEST_ENV.firebaseHost;
  const storageBucket = TEST_ENV.appConfig.storageBucket;

  let test: EmulatorEndToEndTest;
  let testBucket: Bucket;

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

    // Init GCS admin SDK. Used for easier set up/tear down.
    const credential = TEST_ENV.prodServiceAccountKeyJson
      ? admin.credential.cert(TEST_ENV.prodServiceAccountKeyJson)
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    admin.app().delete();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    TEST_ENV.removeEnvVars();
    if (!TEST_ENV.useProductionServers) {
      await test.stopEmulators();
    }
  });

  beforeEach(async () => {
    await resetState();
    await testBucket.upload(smallFilePath, { destination: TEST_FILE_NAME });
  });

  it("should return an error message when uploading a file with invalid metadata", async () => {
    const fileName = "test_upload.jpg";
    const errorMessage = await supertest(firebaseHost)
      .post(`/v0/b/${storageBucket}/o/?name=${fileName}`)
      .set({ "x-goog-upload-protocol": "multipart", "content-type": "foo" })
      .expect(400)
      .then((res) => res.body.error.message);

    expect(errorMessage).to.equal("Invalid Content-Type: foo");
  });

  it("should accept subsequent resumable upload commands without an auth header", async () => {
    const uploadURL = await supertest(firebaseHost)
      .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({
        Authorization: "Bearer owner",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
      })
      .expect(200)
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(firebaseHost)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        // No Authorization required in upload
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload",
      })
      .expect(200);

    const uploadStatus = await supertest(firebaseHost)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        // No Authorization required in finalize
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      })
      .expect(200)
      .then((res) => res.header["x-goog-upload-status"]);

    expect(uploadStatus).to.equal("final");

    await supertest(firebaseHost)
      .get(`/v0/b/${storageBucket}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  it("should return 403 when resumable upload is unauthenticated", async () => {
    const uploadURL = await supertest(firebaseHost)
      .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({
        // Authorization missing
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
      })
      .expect(200)
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(firebaseHost)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      })
      .expect(403);
  });

  describe("cancels upload", () => {
    it("should cancel upload successfully", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(200);

      await supertest(firebaseHost)
        .get(`/v0/b/${storageBucket}/o/test_upload.jpg`)
        .set({ Authorization: "Bearer owner" })
        .expect(404);
    });

    it("should return 200 when cancelling already cancelled upload", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(200);

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(200);
    });

    it("should return 400 when cancelling finalized resumable upload", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "upload, finalize",
        })
        .expect(200);

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(400);
    });

    it("should return 404 when cancelling non-existent upload", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
        .set({
          Authorization: "Bearer owner",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search.replace(/(upload_id=).*?(&)/, "$1foo$2"))
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "cancel",
        })
        .expect(404);
    });
  });
  describe("tokens", () => {
    it("should generate new token on create_token", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",").length).to.deep.equal(1);
        });
    });

    it("should return a 400 if create_token value is invalid", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=someNonTrueParam`)
        .set({ Authorization: "Bearer owner" })
        .expect(400);
    });

    it("should return a 403 for create_token if auth header is invalid", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer somethingElse" })
        .expect(403);
    });

    it("should delete a download token", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200);
      const tokens = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => res.body.downloadTokens.split(","));
      // delete the newly added token
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=${tokens[0]}`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",")).to.deep.equal([tokens[1]]);
        });
    });

    it("should regenerate a new token if the last remaining one is deleted", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set({ Authorization: "Bearer owner" })
        .expect(200);
      const token = await supertest(firebaseHost)
        .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
        .set({ Authorization: "Bearer owner" })
        .expect(200)
        .then((res) => res.body.downloadTokens);

      await supertest(firebaseHost)
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
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=someToken`)
        .set({ Authorization: "Bearer somethingElse" })
        .expect(403);
    });
  });
});
