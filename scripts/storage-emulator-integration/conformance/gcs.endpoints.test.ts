import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as supertest from "supertest";
import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import { TEST_ENV } from "./env";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  TEST_SETUP_TIMEOUT,
  getTmpDir,
} from "../utils";

// TODO(b/242314185): add more coverage.
const TEST_FILE_NAME = "gcs/testFile";

describe("GCS endpoint conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const storageBucket = TEST_ENV.appConfig.storageBucket;
  const storageHost = TEST_ENV.storageHost;

  let test: EmulatorEndToEndTest;
  let testBucket: Bucket;
  let authHeader: { Authorization: string };

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
    authHeader = { Authorization: `Bearer ${await TEST_ENV.adminAccessTokenGetter}` };
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
      // TODO(b/241813366): Metadata set in emulator is not consistent with prod
      it("should handle resumable uploads", async () => {
        const uploadURL = await supertest(storageHost)
          .post(
            `/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}&uploadType=resumable`
          )
          .set(authHeader)
          .send({})
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

        expect(metadata.name).to.equal(TEST_FILE_NAME);
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

      it("should handle resumable upload with name only in metadata", async () => {
        const uploadURL = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=resumable`)
          .set(authHeader)
          .send({ name: TEST_FILE_NAME })
          .expect(200)
          .then((res) => new URL(res.header["location"]));
        expect(uploadURL.searchParams?.get("name")).to.equal(TEST_FILE_NAME);
      });

      it("should handle multipart upload with name only in metadata", async () => {
        const body = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
content-type: application/json\r
\r
{"name":"${TEST_FILE_NAME}"}\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
content-type: text/plain\r
\r
hello there!
\r
--b1d5b2e3-1845-4338-9400-6ac07ce53c1e--\r
`);
        const responseName = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=multipart`)
          .set(authHeader)
          .set({
            "content-type": "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e",
          })
          .send(body)
          .expect(200)
          .then((res) => res.body.name);
        expect(responseName).to.equal(TEST_FILE_NAME);
      });

      it("should return an error message when uploading a file with invalid metadata", async () => {
        const errorMessage = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
          .set(authHeader)
          .set({ "X-Upload-Content-Type": "foo" })
          .expect(400)
          .then((res) => res.body.error.message);

        expect(errorMessage).to.include("Bad content type.");
      });
    });
  });

  describe(".file()", () => {
    describe("#getMetadata()", () => {
      it("should return generated custom metadata for new upload", async () => {
        const customMetadata = {
          contentDisposition: "initialCommit",
          contentType: "image/jpg",
          name: TEST_FILE_NAME,
        };

        const uploadURL = await supertest(storageHost)
          .post(
            `/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}&uploadType=resumable`
          )
          .set(authHeader)
          .send(customMetadata)
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
    });
  });
});
