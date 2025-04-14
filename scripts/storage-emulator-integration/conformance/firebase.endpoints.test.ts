import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as supertest from "supertest";
import { gunzipSync } from "zlib";
import { TEST_ENV } from "./env";
import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  getTmpDir,
  TEST_SETUP_TIMEOUT,
  createRandomFile,
} from "../utils";

const TEST_FILE_NAME = "testing/storage_ref/testFile";
const ENCODED_TEST_FILE_NAME = "testing%2Fstorage_ref%2FtestFile";

// headers
const uploadStatusHeader = "x-goog-upload-status";

// TODO(b/242314185): add more coverage.
describe("Firebase Storage endpoint conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath = createRandomFile("small_file", 10, tmpDir);

  const firebaseHost = TEST_ENV.firebaseHost;
  const storageBucket = TEST_ENV.appConfig.storageBucket;

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
      await test.startEmulators(["--only", "auth,storage"]);
    }

    // Init GCS admin SDK. Used for easier set up/tear down.
    const credential = TEST_ENV.prodServiceAccountKeyJson
      ? admin.credential.cert(TEST_ENV.prodServiceAccountKeyJson)
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);
    authHeader = { Authorization: `Bearer ${await TEST_ENV.adminAccessTokenGetter}` };
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
  });

  describe("metadata", () => {
    it("should set default metadata", async () => {
      const fileName = "dir/someFile";
      const encodedFileName = "dir%2FsomeFile";
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o?name=${fileName}`)
        .set(authHeader)
        .send(Buffer.from("hello world"))
        .expect(200);

      const metadata = await supertest(firebaseHost)
        .get(`/v0/b/${storageBucket}/o/${encodedFileName}`)
        .set(authHeader)
        .expect(200)
        .then((res) => res.body);

      expect(Object.keys(metadata)).to.include.members([
        "name",
        "bucket",
        "generation",
        "metageneration",
        "timeCreated",
        "updated",
        "storageClass",
        "size",
        "md5Hash",
        "contentEncoding",
        "contentDisposition",
        "crc32c",
        "etag",
        "downloadTokens",
      ]);

      expect(metadata.name).to.be.eql(fileName);
      expect(metadata.bucket).to.be.eql(storageBucket);
      expect(metadata.generation).to.be.a("string");
      expect(metadata.metageneration).to.be.eql("1");
      expect(metadata.timeCreated).to.be.a("string");
      expect(metadata.updated).to.be.a("string");
      expect(metadata.storageClass).to.be.a("string");
      expect(metadata.size).to.be.eql("11");
      expect(metadata.md5Hash).to.be.a("string");
      expect(metadata.contentEncoding).to.be.eql("identity");
      expect(metadata.contentDisposition).to.be.a("string");
      expect(metadata.crc32c).to.be.a("string");
      expect(metadata.etag).to.be.a("string");
      expect(metadata.downloadTokens).to.be.a("string");
    });
  });

  describe("media upload", () => {
    it("should default to media upload if upload type is not provided", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o?name=${ENCODED_TEST_FILE_NAME}`)
        .set(authHeader)
        .send(Buffer.from("hello world"))
        .expect(200);

      const data = await supertest(firebaseHost)
        .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?alt=media`)
        .set(authHeader)
        .expect(200)
        .then((res) => res.body);
      expect(String(data)).to.eql("hello world");
    });
  });

  describe("multipart upload", () => {
    it("should return an error message when uploading a file with invalid content type", async () => {
      const res = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/?name=${ENCODED_TEST_FILE_NAME}`)
        .set(authHeader)
        .set({ "x-goog-upload-protocol": "multipart", "content-type": "foo" })
        .send()
        .expect(400);
      expect(res.text).to.include("Bad content type.");
    });
  });

  describe("resumable upload", () => {
    describe("upload", () => {
      it("should accept subsequent resumable upload commands without an auth header", async () => {
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
          })
          .expect(200)
          .then((res) => new URL(res.header["x-goog-upload-url"]));

        await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          // No Authorization required in upload
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "upload",
            "X-Goog-Upload-Offset": 0,
          })
          .expect(200);
        const uploadStatus = await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          // No Authorization required in finalize
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(200)
          .then((res) => res.header[uploadStatusHeader]);

        expect(uploadStatus).to.equal("final");

        await supertest(firebaseHost)
          .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .expect(200);
      });

      it("should handle resumable uploads with an empty buffer", async () => {
        const uploadUrl = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
          })
          .send({})
          .expect(200)
          .then((res) => {
            return new URL(res.header["x-goog-upload-url"]);
          });

        const finalizeStatus = await supertest(firebaseHost)
          .post(uploadUrl.pathname + uploadUrl.search)
          .set(authHeader)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .send({})
          .expect(200)
          .then((res) => res.header[uploadStatusHeader]);
        expect(finalizeStatus).to.equal("final");
      });

      it("should return 403 when resumable upload is unauthenticated", async () => {
        const testFileName = "disallowSize0";
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${testFileName}`)
          // Authorization missing
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
          })
          .expect(200)
          .then((res) => new URL(res.header["x-goog-upload-url"]));

        const uploadStatus = await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "upload, finalize",
            "X-Goog-Upload-Offset": 0,
          })
          .expect(403)
          .then((res) => res.header[uploadStatusHeader]);
        expect(uploadStatus).to.equal("final");
      });

      it("should return 403 when resumable upload is unauthenticated and finalize is called again", async () => {
        const testFileName = "disallowSize0";
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${testFileName}?uploadType=resumable`)
          .set({
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
            "X-Goog-Upload-Offset": 0,
          })
          .expect(403);
        const uploadStatus = await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(403)
          .then((res) => res.header[uploadStatusHeader]);
        expect(uploadStatus).to.equal("final");
      });

      it("should return 200 when resumable upload succeeds and finalize is called again", async () => {
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?uploadType=resumable`)
          .set(authHeader)
          .set({
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
            "X-Goog-Upload-Offset": 0,
          })
          .expect(200);
        await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(200);
      });

      it("should return 400 both times when finalize is called on cancelled upload", async () => {
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?uploadType=resumable`)
          .set(authHeader)
          .set({
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
            "X-Goog-Upload-Offset": 0,
          })
          .expect(200);
        await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(400);

        await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(400);
      });

      it("should handle resumable uploads with without upload protocol set", async () => {
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
          })
          .expect(200)
          .then((res) => {
            return new URL(res.header["x-goog-upload-url"]);
          });

        await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Command": "upload",
            "X-Goog-Upload-Offset": 0,
          })
          .expect(200);
        const uploadStatus = await supertest(firebaseHost)
          .put(uploadURL.pathname + uploadURL.search)
          .set({
            "X-Goog-Upload-Command": "finalize",
          })
          .expect(200)
          .then((res) => res.header[uploadStatusHeader]);

        expect(uploadStatus).to.equal("final");

        await supertest(firebaseHost)
          .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .expect(200);
      });
    });

    describe("cancel", () => {
      it("should cancel upload successfully", async () => {
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
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
          .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .expect(404);
      });

      it("should return 200 when cancelling already cancelled upload", async () => {
        const uploadURL = await supertest(firebaseHost)
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
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
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
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
            "X-Goog-Upload-Offset": 0,
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
          .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
          .set(authHeader)
          .set({
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
  });

  describe("gzip", () => {
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
          `${firebaseHost}/v0/b/${storageBucket}/o/${fileName}?alt=media`,
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
          `${firebaseHost}/v0/b/${storageBucket}/o/${fileName}?alt=media`,
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

  describe("upload status", () => {
    it("should update the status to active after an upload is started", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
        .set(authHeader)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));
      const queryUploadStatus = await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "query",
        })
        .expect(200)
        .then((res) => res.header[uploadStatusHeader]);
      expect(queryUploadStatus).to.equal("active");
    });
    it("should update the status to cancelled after an upload is cancelled", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
        .set(authHeader)
        .set({
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
      const queryUploadStatus = await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "query",
        })
        .expect(200)
        .then((res) => res.header[uploadStatusHeader]);
      expect(queryUploadStatus).to.equal("cancelled");
    });
    it("should update the status to final after an upload is finalized", async () => {
      const uploadURL = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o?name=${TEST_FILE_NAME}`)
        .set(authHeader)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
        })
        .expect(200)
        .then((res) => new URL(res.header["x-goog-upload-url"]));

      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "upload",
          "X-Goog-Upload-Offset": 0,
        })
        .expect(200);
      await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "finalize",
        })
        .expect(200)
        .then((res) => res.header[uploadStatusHeader]);
      const queryUploadStatus = await supertest(firebaseHost)
        .put(uploadURL.pathname + uploadURL.search)
        .set({
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "query",
        })
        .expect(200)
        .then((res) => res.header[uploadStatusHeader]);
      expect(queryUploadStatus).to.equal("final");
    });
  });

  describe("tokens", () => {
    beforeEach(async () => {
      await testBucket.upload(smallFilePath, { destination: TEST_FILE_NAME });
    });

    it("should generate new token on create_token", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set(authHeader)
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",").length).to.deep.equal(1);
        });
    });

    it("should return a 400 if create_token value is invalid", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=someNonTrueParam`)
        .set(authHeader)
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
        .set(authHeader)
        .expect(200);
      const tokens = await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set(authHeader)
        .expect(200)
        .then((res) => res.body.downloadTokens.split(","));
      // delete the newly added token
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=${tokens[0]}`)
        .set(authHeader)
        .expect(200)
        .then((res) => {
          const metadata = res.body;
          expect(metadata.downloadTokens.split(",")).to.deep.equal([tokens[1]]);
        });
    });

    it("should regenerate a new token if the last remaining one is deleted", async () => {
      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?create_token=true`)
        .set(authHeader)
        .expect(200);
      const token = await supertest(firebaseHost)
        .get(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}`)
        .set(authHeader)
        .expect(200)
        .then((res) => res.body.downloadTokens);

      await supertest(firebaseHost)
        .post(`/v0/b/${storageBucket}/o/${ENCODED_TEST_FILE_NAME}?delete_token=${token}`)
        .set(authHeader)
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
