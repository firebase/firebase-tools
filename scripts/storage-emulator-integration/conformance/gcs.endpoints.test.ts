import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as supertest from "supertest";
import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import { gunzipSync } from "zlib";
import { TEST_ENV } from "./env";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  TEST_SETUP_TIMEOUT,
  getTmpDir,
} from "../utils";

// Test case that should only run when targeting the emulator.
// Example use: emulatorOnly.it("Local only test case", () => {...});
const emulatorOnly = { it: TEST_ENV.useProductionServers ? it.skip : it };

const TEST_FILE_NAME = "gcs/testFile";
const ENCODED_TEST_FILE_NAME = "gcs%2FtestFile";

const MULTIPART_REQUEST_BODY = Buffer.from(`--b1d5b2e3-1845-4338-9400-6ac07ce53c1e\r
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

// TODO(b/242314185): add more coverage.
describe("GCS endpoint conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const storageBucket = TEST_ENV.appConfig.storageBucket;
  const storageHost = TEST_ENV.storageHost;
  const googleapisHost = TEST_ENV.googleapisHost;

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

  describe("Headers", () => {
    it("should set default response headers on object download", async () => {
      await supertest(storageHost)
        .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
        .set(authHeader)
        .send(Buffer.from("hello world"))
        .expect(200);

      const res = await supertest(storageHost)
        .get(`/storage/v1/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?alt=media`)
        .set(authHeader)
        .expect(200)
        .then((res) => res);

      expect(res.header["content-type"]).to.be.eql("application/octet-stream");
      expect(res.header["content-disposition"]).to.be.eql("attachment; filename=testFile");
    });
  });

  describe("Metadata", () => {
    it("should set default metadata", async () => {
      await supertest(storageHost)
        .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
        .set(authHeader)
        .send(Buffer.from("hello world"))
        .expect(200);

      const metadata = await supertest(storageHost)
        .get(`/storage/v1/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
        .set(authHeader)
        .expect(200)
        .then((res) => res.body);

      expect(Object.keys(metadata)).to.include.members([
        "kind",
        "id",
        "selfLink",
        "mediaLink",
        "name",
        "bucket",
        "generation",
        "metageneration",
        "storageClass",
        "size",
        "md5Hash",
        "crc32c",
        "etag",
        "timeCreated",
        "updated",
        "timeStorageClassUpdated",
      ]);

      expect(metadata.kind).to.be.eql("storage#object");
      expect(metadata.id).to.be.include(`${storageBucket}/${TEST_FILE_NAME}`);
      expect(metadata.selfLink).to.be.eql(
        `${googleapisHost}/storage/v1/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`,
      );
      expect(metadata.mediaLink).to.include(
        `${storageHost}/download/storage/v1/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`,
      );
      expect(metadata.mediaLink).to.include(`alt=media`);
      expect(metadata.name).to.be.eql(TEST_FILE_NAME);
      expect(metadata.bucket).to.be.eql(storageBucket);
      expect(metadata.generation).to.be.a("string");
      expect(metadata.metageneration).to.be.eql("1");
      expect(metadata.storageClass).to.be.a("string");
      expect(metadata.size).to.be.eql("11");
      expect(metadata.md5Hash).to.be.a("string");
      expect(metadata.crc32c).to.be.a("string");
      expect(metadata.etag).to.be.a("string");
      expect(metadata.timeCreated).to.be.a("string");
      expect(metadata.updated).to.be.a("string");
      expect(metadata.timeStorageClassUpdated).to.be.a("string");
    });
  });

  describe("Upload protocols", () => {
    describe("media upload", () => {
      it("should default to media upload if upload type is not provided", async () => {
        await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
          .set(authHeader)
          .send(Buffer.from("hello world"))
          .expect(200);

        const data = await supertest(storageHost)
          .get(`/storage/v1/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?alt=media`)
          .set(authHeader)
          .expect(200)
          .then((res) => res.body);
        expect(String(data)).to.eql("hello world");
      });
    });

    describe("resumable upload", () => {
      // GCS emulator resumable upload capabilities are limited and this test asserts its broken state.
      emulatorOnly.it("should handle resumable uploads", async () => {
        const uploadURL = await supertest(storageHost)
          .post(
            `/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}&uploadType=resumable`,
          )
          .set(authHeader)
          .expect(200)
          .then((res) => new URL(res.header["location"]));

        const chunk1 = Buffer.from("hello ");
        await supertest(storageHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "upload",
            "X-Goog-Upload-Offset": 0,
          })
          .send(chunk1)
          .expect(200);

        await supertest(storageHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "upload, finalize",
            "X-Goog-Upload-Offset": chunk1.byteLength,
          })
          .send(Buffer.from("world"));

        const data = await supertest(storageHost)
          .get(`/storage/v1/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?alt=media`)
          .set(authHeader)
          .expect(200)
          .then((res) => res.body);
        // TODO: Current GCS upload implementation only supports a single `upload` step.
        expect(String(data)).to.eql("hello ");
      });

      it("should handle resumable upload with name only in metadata", async () => {
        await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=resumable`)
          .set(authHeader)
          .send({ name: TEST_FILE_NAME })
          .expect(200);
      });

      it("should return generated custom metadata for new upload", async () => {
        const customMetadata = {
          contentDisposition: "initialCommit",
          contentType: "image/jpg",
          name: TEST_FILE_NAME,
        };

        const uploadURL = await supertest(storageHost)
          .post(
            `/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}&uploadType=resumable`,
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

      it("should upload content type properly from x-upload-content-type headers", async () => {
        const uploadURL = await supertest(storageHost)
          .post(
            `/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}&uploadType=resumable`,
          )
          .set(authHeader)
          .set({
            "x-upload-content-type": "image/png",
          })
          .expect(200)
          .then((res) => new URL(res.header["location"]));

        const returnedMetadata = await supertest(storageHost)
          .put(uploadURL.pathname + uploadURL.search)
          .expect(200)
          .then((res) => res.body);

        expect(returnedMetadata.contentType).to.equal("image/png");
      });
    });

    describe("multipart upload", () => {
      it("should handle multipart upload with name only in metadata", async () => {
        const responseName = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=multipart`)
          .set(authHeader)
          .set({
            "content-type": "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e",
          })
          .send(MULTIPART_REQUEST_BODY)
          .expect(200)
          .then((res) => res.body.name);
        expect(responseName).to.equal(TEST_FILE_NAME);
      });

      it("should respect X-Goog-Upload-Protocol header", async () => {
        const responseName = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o`)
          .set(authHeader)
          .set({
            "content-type": "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e",
            "X-Goog-Upload-Protocol": "multipart",
          })
          .send(MULTIPART_REQUEST_BODY)
          .expect(200)
          .then((res) => res.body.name);
        expect(responseName).to.equal(TEST_FILE_NAME);
      });

      it("should return an error message on invalid content type", async () => {
        const res = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
          .set(authHeader)
          .set({ "content-type": "foo" })
          .set({ "X-Goog-Upload-Protocol": "multipart" })
          .send(MULTIPART_REQUEST_BODY)
          .expect(400);

        expect(res.text).to.include("Bad content type.");
      });

      it("should upload content type properly from x-upload headers", async () => {
        const returnedMetadata = await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?uploadType=multipart`)
          .set(authHeader)
          .set({
            "content-type": "multipart/related; boundary=b1d5b2e3-1845-4338-9400-6ac07ce53c1e",
          })
          .set({
            "x-upload-content-type": "text/plain",
          })
          .send(MULTIPART_REQUEST_BODY)
          .expect(200)
          .then((res) => res.body);

        expect(returnedMetadata.contentType).to.equal("text/plain");
      });
    });
  });

  describe("Gzip", () => {
    it("should serve gunzipped file by default", async () => {
      const contents = Buffer.from("hello world");
      const fileName = "gzippedFile";
      const file = testBucket.file(fileName);
      await file.save(contents, {
        gzip: true,
        contentType: "text/plain",
      });

      // Use requestClient since supertest will decompress the response body by default.
      await new Promise((resolve, reject) => {
        TEST_ENV.requestClient.get(
          `${storageHost}/download/storage/v1/b/${storageBucket}/o/${fileName}?alt=media`,
          { headers: { ...authHeader } },
          (res) => {
            expect(res.headers["content-encoding"]).to.be.undefined;
            expect(res.headers["content-length"]).to.be.undefined;
            expect(res.headers["content-type"]).to.be.eql("text/plain");

            let responseBody = Buffer.alloc(0);
            res
              .on("data", (chunk) => {
                responseBody = Buffer.concat([responseBody, chunk]);
              })
              .on("end", () => {
                expect(responseBody).to.be.eql(contents);
              })
              .on("close", resolve)
              .on("error", reject);
          },
        );
      });
    });

    it("should serve gzipped file if Accept-Encoding header allows", async () => {
      const contents = Buffer.from("hello world");
      const fileName = "gzippedFile";
      const file = testBucket.file(fileName);
      await file.save(contents, {
        gzip: true,
        contentType: "text/plain",
      });

      // Use requestClient since supertest will decompress the response body by default.
      await new Promise((resolve, reject) => {
        TEST_ENV.requestClient.get(
          `${storageHost}/download/storage/v1/b/${storageBucket}/o/${fileName}?alt=media`,
          { headers: { ...authHeader, "Accept-Encoding": "gzip" } },
          (res) => {
            expect(res.headers["content-encoding"]).to.be.eql("gzip");
            expect(res.headers["content-type"]).to.be.eql("text/plain");

            let responseBody = Buffer.alloc(0);
            res
              .on("data", (chunk) => {
                responseBody = Buffer.concat([responseBody, chunk]);
              })
              .on("end", () => {
                expect(responseBody).to.not.be.eql(contents);
                const decompressed = gunzipSync(responseBody);
                expect(decompressed).to.be.eql(contents);
              })
              .on("close", resolve)
              .on("error", reject);
          },
        );
      });
    });
  });

  describe("List protocols", () => {
    describe("list objects", () => {
      // This test is for the '/storage/v1/b/:bucketId/o' url pattern, which is used specifically by the GO Admin SDK
      it("should list objects in the provided bucket", async () => {
        await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
          .set(authHeader)
          .send(Buffer.from("hello world"))
          .expect(200);

        await supertest(storageHost)
          .post(`/upload/storage/v1/b/${storageBucket}/o?name=${TEST_FILE_NAME}2`)
          .set(authHeader)
          .send(Buffer.from("hello world"))
          .expect(200);

        const data = await supertest(storageHost)
          .get(`/storage/v1/b/${storageBucket}/o`)
          .set(authHeader)
          .expect(200)
          .then((res) => res.body);
        expect(data.items.length).to.equal(2);
      });
    });
  });
});
