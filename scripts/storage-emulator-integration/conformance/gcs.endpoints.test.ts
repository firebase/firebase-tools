import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as supertest from "supertest";
import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import { TEST_ENV } from "./env";
import {
  createRandomFile,
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  SMALL_FILE_SIZE,
  TEST_SETUP_TIMEOUT,
  getTmpDir,
} from "../utils";

// TODO(b/242314185): add more coverage.
describe("GCS endpoint conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);

  const storageBucket = TEST_ENV.appConfig.storageBucket;
  const storageHost = TEST_ENV.storageHost;

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
      await test.startEmulators(["--only", "storage"]);
    }

    // Init GCS admin SDK. Used for easier set up/tear down.
    const credential = TEST_ENV.prodServiceAccountKeyJson
      ? admin.credential.cert(TEST_ENV.prodServiceAccountKeyJson)
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);
  });

  beforeEach(async () => {
    await resetState();
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

  describe(".bucket()", () => {
    describe("#upload()", () => {
      it("should handle resumable uploads", async () => {
        const fileName = "test_upload.jpg";
        const uploadURL = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${fileName}&uploadType=resumable`)
          .send({})
          .set({
            Authorization: "Bearer owner",
          })
          .expect(200)
          .then((res) => new URL(res.header["location"]));

        const metadata = await supertest(storageHost)
          .put(uploadURL.pathname + uploadURL.search)
          .expect(200)
          .then((res) => res.body);

        const metadataTypes: { [s: string]: string } = {};

        for (const key in metadata) {
          if (metadata[key]) {
            metadataTypes[key] = typeof metadata[key];
          }
        }

        expect(metadata.name).to.equal(fileName);
        expect(metadata.contentType).to.equal("application/octet-stream");
        expect(metadataTypes).to.deep.equal({
          kind: "string",
          name: "string",
          bucket: "string",
          cacheControl: "string",
          contentDisposition: "string",
          contentEncoding: "string",
          generation: "string",
          metageneration: "string",
          contentType: "string",
          timeCreated: "string",
          updated: "string",
          storageClass: "string",
          size: "string",
          md5Hash: "string",
          etag: "string",
          crc32c: "string",
          timeStorageClassUpdated: "string",
          id: "string",
          selfLink: "string",
          mediaLink: "string",
        });
      });

      it("should handle resumable uploads with an empty buffer", async () => {
        const fileName = "test_upload.jpg";
        const uploadUrl = await supertest(storageHost)
          .post(`/v0/b/${storageBucket}/o?name=${fileName}&uploadType=resumable`)
          .send({})
          .set({
            Authorization: "Bearer owner",
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
          })
          .expect(200)
          .then((res) => {
            return new URL(res.header["x-goog-upload-url"]);
          });

        const finalizeStatus = await supertest(storageHost)
          .post(uploadUrl.pathname + uploadUrl.search)
          .send({})
          .set({
            Authorization: "Bearer owner",
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(200)
          .then((res) => res.header["x-goog-upload-status"]);
        expect(finalizeStatus).to.equal("final");
      });

      it("should handle resumable upload with name only in metadata", async () => {
        const fileName = "test_upload.jpg";
        const uploadURL = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=resumable`)
          .send({ name: fileName })
          .set({
            Authorization: "Bearer owner",
          })
          .expect(200)
          .then((res) => new URL(res.header["location"]));
        expect(uploadURL.searchParams?.get("name")).to.equal(fileName);
      });

      it("should handle multipart upload with name only in metadata", async () => {
        const body = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
content-type: application/json\r
\r
{"name":"test_upload.jpg"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
content-type: text/plain\r
\r
hello there!
\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);
        const fileName = "test_upload.jpg";
        const responseName = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=multipart`)
          .send(body)
          .set({
            Authorization: "Bearer owner",
            "content-type": "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e",
          })
          .expect(200)
          .then((res) => res.body.name);
        expect(responseName).to.equal(fileName);
      });

      it("should return an error message when uploading a file with invalid metadata", async () => {
        const fileName = "test_upload.jpg";
        const errorMessage = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${fileName}`)
          .set({ Authorization: "Bearer owner", "X-Upload-Content-Type": "foo" })
          .expect(400)
          .then((res) => res.body.error.message);

        expect(errorMessage).to.equal("Invalid Content-Type: foo");
      });
    });
  });

  describe(".file()", () => {
    describe("#getMetadata()", () => {
      it("should return generated custom metadata for new upload", async () => {
        const customMetadata = {
          contentDisposition: "initialCommit",
          contentType: "image/jpg",
          name: "test_upload.jpg",
        };

        const uploadURL = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=test_upload.jpg&uploadType=resumable`)
          .send(customMetadata)
          .set({
            Authorization: "Bearer owner",
          })
          .expect(200)
          .then((res) => new URL(res.header["location"]));

        const returnedMetadata = await supertest(storageHost)
          .put(uploadURL.pathname + uploadURL.search)
          .expect(200)
          .then((res) => res.body);

        expect(returnedMetadata.name).to.equal(customMetadata.name);
        expect(returnedMetadata.contentType).to.equal(customMetadata.contentType);
        expect(returnedMetadata.contentDisposition).to.equal(customMetadata.contentDisposition);
      });

      it("should handle firebaseStorageDownloadTokens", async () => {
        const destination = "public/small_file";
        await testBucket.upload(smallFilePath, {
          destination,
          metadata: {},
        });

        const cloudFile = testBucket.file(destination);
        const incomingMetadata = {
          metadata: {
            firebaseStorageDownloadTokens: "myFirstToken,mySecondToken",
          },
        };

        await cloudFile.setMetadata(incomingMetadata);

        // Check that the tokens are saved in Firebase metadata
        await supertest(storageHost)
          .get(`/v0/b/${testBucket.name}/o/${encodeURIComponent(destination)}`)
          .expect(200)
          .then((res) => {
            const firebaseMd = res.body;
            expect(firebaseMd.downloadTokens).to.equal(
              incomingMetadata.metadata.firebaseStorageDownloadTokens
            );
          });

        // Check that the tokens are saved in Cloud metadata
        const [storedMetadata] = await cloudFile.getMetadata();
        expect(storedMetadata.metadata.firebaseStorageDownloadTokens).to.deep.equal(
          incomingMetadata.metadata.firebaseStorageDownloadTokens
        );
      });
    });
  });
});
