import { Bucket, CopyOptions } from "@google-cloud/storage";
import { expect } from "chai";
import * as firebase from "firebase";
import * as admin from "firebase-admin";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as path from "path";
import * as puppeteer from "puppeteer";
import * as supertest from "supertest";
import { IMAGE_FILE_BASE64, StorageRulesFiles } from "../../src/test/emulators/fixtures";
import { TriggerEndToEndTest } from "../integration-helpers/framework";
import {
  createRandomFile,
  EMULATORS_SHUTDOWN_DELAY_MS,
  getAuthEmulatorHost,
  getStorageEmulatorHost,
  readEmulatorConfig,
  readFile,
  readJson,
  readProdAppConfig,
  resetStorageEmulator,
  SERVICE_ACCOUNT_KEY,
  signInToFirebaseAuth,
  SMALL_FILE_SIZE,
  TEST_SETUP_TIMEOUT,
  uploadText,
  writeToFile,
} from "./utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

// Flip these flags for options during test debugging
// all should be FALSE on commit
const TEST_CONFIG = {
  // Set this to true to use production servers
  // (useful for writing tests against source of truth)
  useProductionServers: false,

  // Set this to true to make the headless chrome window visible
  // (useful for ensuring the browser is running as expected)
  showBrowser: false,
};

// Temp directory to store generated files.
let tmpDir: string;

// TODO(b/241151246): Fix conformance tests.
describe("Storage emulator", () => {
  let test: TriggerEndToEndTest;

  let testBucket: Bucket;
  const SMALL_FILE_PATH: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);
  const EMPTY_FILE_PATH: string = createRandomFile("empty_file", 0, tmpDir);

  const DEFAULT_RULES = readFile("storage.rules");

  // Emulators accept fake app configs. This is sufficient for testing against the emulator.
  const FAKE_APP_CONFIG = {
    apiKey: "fake-api-key",
    projectId: `${FIREBASE_PROJECT}`,
    authDomain: `${FIREBASE_PROJECT}.firebaseapp.com`,
    storageBucket: `${FIREBASE_PROJECT}.appspot.com`,
    appId: "fake-app-id",
  };

  const appConfig = TEST_CONFIG.useProductionServers ? readProdAppConfig() : FAKE_APP_CONFIG;
  const emulatorConfig = readEmulatorConfig();

  const storageBucket = appConfig.storageBucket;
  const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(emulatorConfig);
  const AUTH_EMULATOR_HOST = getAuthEmulatorHost(emulatorConfig);

  const expectedHost = TEST_CONFIG.useProductionServers
    ? "https://firebasestorage.googleapis.com"
    : STORAGE_EMULATOR_HOST;

  const emulatorSpecificDescribe = TEST_CONFIG.useProductionServers ? describe.skip : describe;

  async function resetEmulatorState(): Promise<void> {
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

    // TODO: We should not need a real credential for emulator tests, but
    //       today we do.
    const credential = fs.existsSync(path.join(__dirname, SERVICE_ACCOUNT_KEY))
      ? admin.credential.cert(readJson(SERVICE_ACCOUNT_KEY))
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);
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

  describe("Admin SDK Endpoints", () => {
    beforeEach(async () => {
      await resetEmulatorState();
    });

    describe(".bucket()", () => {
      describe("#upload()", () => {
        it("should handle non-resumable uploads", async () => {
          await testBucket.upload(SMALL_FILE_PATH, {
            resumable: false,
          });
          // Doesn't require an assertion, will throw on failure
        });

        it("should replace existing file on upload", async () => {
          const path = "replace.txt";
          const content1 = createRandomFile("small_content_1", 10, tmpDir);
          const content2 = createRandomFile("small_content_2", 10, tmpDir);
          const file = testBucket.file(path);

          await testBucket.upload(content1, {
            destination: path,
          });

          const [readContent1] = await file.download();

          expect(readContent1).to.deep.equal(fs.readFileSync(content1));

          await testBucket.upload(content2, {
            destination: path,
          });

          const [readContent2] = await file.download();
          expect(readContent2).to.deep.equal(fs.readFileSync(content2));

          fs.unlinkSync(content1);
          fs.unlinkSync(content2);
        });

        it("should handle gzip'd uploads", async () => {
          // This appears to pass, but the file gets corrupted cause it's gzipped?
          // expect(true).to.be.false;
          await testBucket.upload(SMALL_FILE_PATH, {
            gzip: true,
          });
        });

        it("should handle resumable uploads", async () => {
          const fileName = "test_upload.jpg";
          const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
            .post(`/upload/storage/v1/b/${storageBucket}/o?name=${fileName}&uploadType=resumable`)
            .send({})
            .set({
              Authorization: "Bearer owner",
            })
            .expect(200)
            .then((res) => new URL(res.header["location"]));

          const metadata = await supertest(STORAGE_EMULATOR_HOST)
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

        it("should upload with provided metadata", async () => {
          const metadata = {
            contentDisposition: "attachment",
            cacheControl: "private,max-age=30",
            contentLanguage: "de-DE",
            metadata: { foo: "bar" },
          };
          const [, fileMetadata] = await testBucket.upload(SMALL_FILE_PATH, {
            resumable: false,
            metadata,
          });

          expect(fileMetadata).to.deep.include(metadata);
        });
        // TODO(b/241151246): Fix conformance tests.
        it("should handle resumable upload with name only in metadata", async () => {
          const fileName = "test_upload.jpg";
          const uploadURL = await supertest(expectedHost)
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
          const responseName = await supertest(expectedHost)
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
          const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
            .post(`/upload/storage/v1/b/${storageBucket}/o?name=${fileName}`)
            .set({ Authorization: "Bearer owner", "X-Upload-Content-Type": "foo" })
            .expect(400)
            .then((res) => res.body.error.message);

          expect(errorMessage).to.equal("Invalid Content-Type: foo");
        });

        it("should be able to upload file named 'prefix/file.txt' when file named 'prefix' already exists", async () => {
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: "prefix",
          });
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: "prefix/file.txt",
          });
        });

        it("should be able to upload file named 'prefix' when file named 'prefix/file.txt' already exists", async () => {
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: "prefix/file.txt",
          });
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: "prefix",
          });
        });
      });

      describe("#getFiles()", () => {
        const TESTING_FILE = "testing/shoveler.svg";
        const PREFIX_FILE = "prefix";
        const PREFIX_1_FILE = PREFIX_FILE + "/1.txt";
        const PREFIX_2_FILE = PREFIX_FILE + "/2.txt";
        const PREFIX_SUB_DIRECTORY_FILE = PREFIX_FILE + "/dir/file.txt";

        beforeEach(async () => {
          await Promise.all(
            [
              TESTING_FILE,
              PREFIX_FILE,
              PREFIX_1_FILE,
              PREFIX_2_FILE,
              PREFIX_SUB_DIRECTORY_FILE,
            ].map(async (f) => {
              await testBucket.upload(SMALL_FILE_PATH, {
                destination: f,
              });
            })
          );
        });

        it("should list all files in bucket", async () => {
          // This is only test that uses autoPagination as the other tests look at the prefixes response
          const [files] = await testBucket.getFiles();

          expect(files.map((file) => file.name)).to.deep.equal([
            PREFIX_FILE,
            PREFIX_1_FILE,
            PREFIX_2_FILE,
            PREFIX_SUB_DIRECTORY_FILE,
            TESTING_FILE,
          ]);
        });

        it("should list all files in bucket using maxResults and pageToken", async () => {
          const [files1, , { nextPageToken: nextPageToken1 }] = await testBucket.getFiles({
            maxResults: 3,
          });

          expect(nextPageToken1).to.be.a("string").and.not.empty;
          expect(files1.map((file) => file.name)).to.deep.equal([
            PREFIX_FILE,
            PREFIX_1_FILE,
            PREFIX_2_FILE,
          ]);

          const [files2, , { nextPageToken: nextPageToken2 }] = await testBucket.getFiles({
            maxResults: 3,
            pageToken: nextPageToken1,
          });

          expect(nextPageToken2).to.be.undefined;
          expect(files2.map((file) => file.name)).to.deep.equal([
            PREFIX_SUB_DIRECTORY_FILE,
            TESTING_FILE,
          ]);
        });

        it("should list files with prefix", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "prefix",
          });

          expect(prefixes).to.be.undefined;
          expect(files.map((file) => file.name)).to.deep.equal([
            PREFIX_FILE,
            PREFIX_1_FILE,
            PREFIX_2_FILE,
            PREFIX_SUB_DIRECTORY_FILE,
          ]);
        });

        it("should list files using common delimiter", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            delimiter: "/",
          });

          expect(prefixes).to.be.deep.equal(["prefix/", "testing/"]);
          expect(files.map((file) => file.name)).to.deep.equal([PREFIX_FILE]);
        });

        it("should list files using other delimiter", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            delimiter: "dir",
          });

          expect(prefixes).to.be.deep.equal(["prefix/dir"]);
          expect(files.map((file) => file.name)).to.deep.equal([
            PREFIX_FILE,
            PREFIX_1_FILE,
            PREFIX_2_FILE,
            TESTING_FILE,
          ]);
        });

        it("should list files using same prefix and delimiter of p", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "p",
            delimiter: "p",
          });

          expect(prefixes).to.be.undefined;
          expect(files.map((file) => file.name)).to.deep.equal([
            PREFIX_FILE,
            PREFIX_1_FILE,
            PREFIX_2_FILE,
            PREFIX_SUB_DIRECTORY_FILE,
          ]);
        });

        it("should list files using same prefix and delimiter of t", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "t",
            delimiter: "t",
          });

          expect(prefixes).to.be.deep.equal(["test"]);
          expect(files.map((file) => file.name)).to.be.empty;
        });

        it("should list files using prefix=p and delimiter=t", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "p",
            delimiter: "t",
          });

          expect(prefixes).to.be.deep.equal(["prefix/1.t", "prefix/2.t", "prefix/dir/file.t"]);
          expect(files.map((file) => file.name)).to.deep.equal([PREFIX_FILE]);
        });

        it("should list files in sub-directory (using prefix and delimiter)", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "prefix/",
            delimiter: "/",
          });

          expect(prefixes).to.be.deep.equal(["prefix/dir/"]);
          expect(files.map((file) => file.name)).to.deep.equal([PREFIX_1_FILE, PREFIX_2_FILE]);
        });

        it("should list files in sub-directory (using prefix)", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "prefix/",
          });

          expect(prefixes).to.be.undefined;
          expect(files.map((file) => file.name)).to.deep.equal([
            PREFIX_1_FILE,
            PREFIX_2_FILE,
            PREFIX_SUB_DIRECTORY_FILE,
          ]);
        });

        it("should list files in sub-directory (using directory)", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            directory: "testing/",
          });

          expect(prefixes).to.be.undefined;
          expect(files.map((file) => file.name)).to.deep.equal([TESTING_FILE]);
        });

        it("should list no files for unused prefix", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "blah/",
          });

          expect(prefixes).to.be.undefined;
          expect(files).to.be.empty;
        });

        it("should list files using prefix=pref and delimiter=i", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "pref",
            delimiter: "i",
          });

          expect(prefixes).to.be.deep.equal(["prefi"]);
          expect(files).to.be.empty;
        });

        it("should list files using prefix=prefi and delimiter=i", async () => {
          const [files, , { prefixes }] = await testBucket.getFiles({
            autoPaginate: false,
            prefix: "prefi",
            delimiter: "i",
          });

          expect(prefixes).to.be.deep.equal(["prefix/di"]);
          expect(files.map((file) => file.name)).to.deep.equal([
            PREFIX_FILE,
            PREFIX_1_FILE,
            PREFIX_2_FILE,
          ]);
        });
      });
    });

    describe(".file()", () => {
      describe("#save()", () => {
        // TODO(abehaskins): This test is temporarily disabled due to a credentials issue
        it.skip("should accept a zero-byte file", async () => {
          await testBucket.file("testing/dir/").save("");

          const [files] = await testBucket.getFiles({
            directory: "testing",
          });

          expect(files.map((file) => file.name)).to.contain("testing/dir/");
        });
      });

      describe("#get()", () => {
        // TODO(abehaskins): This test is temporarily disabled due to a credentials issue
        it.skip("should complete an save/get/download cycle", async () => {
          const p = "testing/dir/hello.txt";
          const content = "hello, world";

          await testBucket.file(p).save(content);

          const [f] = await testBucket.file(p).get();
          const [buf] = await f.download();

          expect(buf.toString()).to.equal(content);
        });
      });

      describe("#exists()", () => {
        it("should return false for a file that does not exist", async () => {
          // Ensure that the file exists on the bucket before deleting it
          const [exists] = await testBucket.file("no-file").exists();
          expect(exists).to.equal(false);
        });

        it("should return true for a file that exists", async () => {
          // We use a nested path to ensure that we don't need to decode
          // the objectId in the gcloud emulator API
          const bucketFilePath = "file/to/exists";
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: bucketFilePath,
          });

          const [exists] = await testBucket.file(bucketFilePath).exists();
          expect(exists).to.equal(true);
        });

        it("should return false when called on a directory containing files", async () => {
          // We use a nested path to ensure that we don't need to decode
          // the objectId in the gcloud emulator API
          const path = "file/to";
          const bucketFilePath = path + "/exists";
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: bucketFilePath,
          });

          const [exists] = await testBucket.file(path).exists();
          expect(exists).to.equal(false);
        });
      });

      describe("#delete()", () => {
        it("should delete a file from the bucket", async () => {
          // We use a nested path to ensure that we don't need to decode
          // the objectId in the gcloud emulator API
          const bucketFilePath = "file/to/delete";
          await testBucket.upload(SMALL_FILE_PATH, {
            destination: bucketFilePath,
          });

          // Get a reference to the uploaded file
          const toDeleteFile = testBucket.file(bucketFilePath);

          // Ensure that the file exists on the bucket before deleting it
          const [existsBefore] = await toDeleteFile.exists();
          expect(existsBefore).to.equal(true);

          // Delete it
          await toDeleteFile.delete();
          // Ensure that it doesn't exist anymore on the bucket
          const [existsAfter] = await toDeleteFile.exists();
          expect(existsAfter).to.equal(false);
        });

        it("should throw 404 object error for file not found", async () => {
          await expect(testBucket.file("blah").delete())
            .to.be.eventually.rejectedWith(`No such object: ${storageBucket}/blah`)
            .and.nested.include({
              code: 404,
              "errors[0].reason": "notFound",
            });
        });
      });

      describe("#download()", () => {
        it("should return the content of the file", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [downloadContent] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .download();

          const actualContent = fs.readFileSync(SMALL_FILE_PATH);
          expect(downloadContent).to.deep.equal(actualContent);
        });

        it("should return partial content of the file", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [downloadContent] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            // Request 10 bytes (range requests are inclusive)
            .download({ start: 10, end: 19 });

          const actualContent = fs.readFileSync(SMALL_FILE_PATH).slice(10, 20);
          expect(downloadContent).to.have.lengthOf(10).and.deep.equal(actualContent);
        });

        it("should throw 404 error for file not found", async () => {
          const err = (await expect(
            testBucket.file("blah").download()
          ).to.be.eventually.rejectedWith(`No such object: ${storageBucket}/blah`)) as Error;

          expect(err).to.have.property("code", 404);
          expect(err).not.have.nested.property("errors[0]");
        });
      });

      describe("#copy()", () => {
        const COPY_DESTINATION_FILENAME = "copied_file";

        it("should copy the file", async () => {
          await testBucket.upload(SMALL_FILE_PATH);

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          const [, resp] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file);

          expect(resp)
            .to.have.all.keys(["kind", "totalBytesRewritten", "objectSize", "done", "resource"])
            .and.include({
              kind: "storage#rewriteResponse",
              totalBytesRewritten: String(SMALL_FILE_SIZE),
              objectSize: String(SMALL_FILE_SIZE),
              done: true,
            });

          const [copiedContent] = await file.download();

          const actualContent = fs.readFileSync(SMALL_FILE_PATH);
          expect(copiedContent).to.deep.equal(actualContent);
        });

        it("should copy the file to a different bucket", async () => {
          await testBucket.upload(SMALL_FILE_PATH);

          const otherBucket = testBucket.storage.bucket("other-bucket");
          const file = otherBucket.file(COPY_DESTINATION_FILENAME);
          const [, { resource: metadata }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file);

          expect(metadata).to.have.property("bucket", otherBucket.name);

          const [copiedContent] = await file.download();

          const actualContent = fs.readFileSync(SMALL_FILE_PATH);
          expect(copiedContent).to.deep.equal(actualContent);
        });

        it("should return the metadata of the destination file", async () => {
          await testBucket.upload(SMALL_FILE_PATH);

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          const [, { resource: actualMetadata }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file);

          const [expectedMetadata] = await file.getMetadata();
          expect(actualMetadata).to.deep.equal(expectedMetadata);
        });

        it("should copy the file preserving the original metadata", async () => {
          const [, source] = await testBucket.upload(SMALL_FILE_PATH, {
            metadata: {
              cacheControl: "private,no-store",
              metadata: {
                hello: "world",
              },
            },
          });

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          await testBucket.file(SMALL_FILE_PATH.split("/").slice(-1)[0]).copy(file);

          const [metadata] = await file.getMetadata();

          expect(metadata).to.have.all.keys(source).and.deep.include({
            bucket: source.bucket,
            contentType: source.contentType,
            crc32c: source.crc32c,
            cacheControl: source.cacheControl,
            metadata: source.metadata,
          });

          const metadataTypes: { [s: string]: string } = {};

          for (const key in metadata) {
            if (metadata[key]) {
              metadataTypes[key] = typeof metadata[key];
            }
          }

          expect(metadataTypes).to.deep.equal({
            bucket: "string",
            contentType: "string",
            contentDisposition: "string",
            contentEncoding: "string",
            generation: "string",
            md5Hash: "string",
            crc32c: "string",
            cacheControl: "string",
            etag: "string",
            metageneration: "string",
            storageClass: "string",
            name: "string",
            size: "string",
            timeCreated: "string",
            updated: "string",
            id: "string",
            kind: "string",
            mediaLink: "string",
            selfLink: "string",
            timeStorageClassUpdated: "string",
            metadata: "object",
          });
        });

        it("should copy the file and overwrite with the provided custom metadata", async () => {
          const [, source] = await testBucket.upload(SMALL_FILE_PATH, {
            metadata: {
              cacheControl: "private,no-store",
              metadata: {
                hello: "world",
              },
            },
          });

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          const metadata = { foo: "bar" };
          const cacheControl = "private,max-age=10,immutable";
          // Types for CopyOptions are wrong (@google-cloud/storage sub-dependency needs
          // update to include https://github.com/googleapis/nodejs-storage/pull/1406
          // and https://github.com/googleapis/nodejs-storage/pull/1426)
          const copyOpts: CopyOptions & { [key: string]: unknown } = {
            metadata,
            cacheControl,
          };
          const [, { resource: metadata1 }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file, copyOpts);

          expect(metadata1).to.deep.include({
            bucket: source.bucket,
            contentType: source.contentType,
            crc32c: source.crc32c,
            metadata,
            cacheControl,
          });

          // Also double check with a new metadata fetch
          const [metadata2] = await file.getMetadata();
          expect(metadata2).to.deep.equal(metadata1);
        });

        it("should set null custom metadata values to empty strings", async () => {
          const [, source] = await testBucket.upload(SMALL_FILE_PATH);

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          const metadata = { foo: "bar", nullMetadata: null };
          const cacheControl = "private,max-age=10,immutable";
          // Types for CopyOptions are wrong (@google-cloud/storage sub-dependency needs
          // update to include https://github.com/googleapis/nodejs-storage/pull/1406
          // and https://github.com/googleapis/nodejs-storage/pull/1426)
          const copyOpts: CopyOptions & { [key: string]: unknown } = {
            metadata,
            cacheControl,
          };
          const [, { resource: metadata1 }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file, copyOpts);

          expect(metadata1).to.deep.include({
            bucket: source.bucket,
            contentType: source.contentType,
            crc32c: source.crc32c,
            metadata: {
              foo: "bar",
              // Sets null metadata values to empty strings
              nullMetadata: "",
            },
            cacheControl,
          });

          // Also double check with a new metadata fetch
          const [metadata2] = await file.getMetadata();
          expect(metadata2).to.deep.equal(metadata1);
        });

        it("should preserve firebaseStorageDownloadTokens", async () => {
          const firebaseStorageDownloadTokens = "token1,token2";
          await testBucket.upload(SMALL_FILE_PATH, {
            metadata: {
              metadata: {
                firebaseStorageDownloadTokens,
              },
            },
          });

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          const [, { resource: metadata }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file);

          expect(metadata).to.deep.include({
            metadata: {
              firebaseStorageDownloadTokens,
            },
          });
        });

        it("should remove firebaseStorageDownloadTokens when overwriting custom metadata", async () => {
          await testBucket.upload(SMALL_FILE_PATH, {
            metadata: {
              metadata: {
                firebaseStorageDownloadTokens: "token1,token2",
              },
            },
          });

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          const metadata = { foo: "bar" };
          // Types for CopyOptions are wrong (@google-cloud/storage sub-dependency needs
          // update to include https://github.com/googleapis/nodejs-storage/pull/1406
          // and https://github.com/googleapis/nodejs-storage/pull/1426)
          const copyOpts: CopyOptions & { [key: string]: unknown } = {
            metadata,
          };
          const [, { resource: metadataOut }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .copy(file, copyOpts);

          expect(metadataOut).to.deep.include({ metadata });
        });

        it("should not support the use of a rewriteToken", async () => {
          await testBucket.upload(SMALL_FILE_PATH);

          const file = testBucket.file(COPY_DESTINATION_FILENAME);
          await expect(
            testBucket
              .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
              .copy(file, { token: "foo-bar" })
          ).to.eventually.be.rejected.and.have.property("code", 501);
        });
      });

      describe("#makePublic()", () => {
        it("should no-op", async () => {
          const destination = "a/b";
          await testBucket.upload(SMALL_FILE_PATH, { destination });
          const [aclMetadata] = await testBucket.file(destination).makePublic();

          const generation = aclMetadata.generation;
          delete aclMetadata.generation;

          expect(aclMetadata).to.deep.equal({
            kind: "storage#objectAccessControl",
            object: destination,
            id: `${testBucket.name}/${destination}/${generation}/allUsers`,
            selfLink: `${STORAGE_EMULATOR_HOST}/storage/v1/b/${
              testBucket.name
            }/o/${encodeURIComponent(destination)}/acl/allUsers`,
            bucket: testBucket.name,
            entity: "allUsers",
            role: "READER",
            etag: "someEtag",
          });
        });

        it("should not interfere with downloading of bytes via public URL", async () => {
          const destination = "a/b";
          await testBucket.upload(SMALL_FILE_PATH, { destination });
          await testBucket.file(destination).makePublic();

          const publicLink = `${STORAGE_EMULATOR_HOST}/${testBucket.name}/${destination}`;

          const requestClient = TEST_CONFIG.useProductionServers ? https : http;
          await new Promise((resolve, reject) => {
            requestClient.get(publicLink, {}, (response) => {
              const data: any = [];
              response
                .on("data", (chunk) => data.push(chunk))
                .on("end", () => {
                  expect(Buffer.concat(data).length).to.equal(SMALL_FILE_SIZE);
                })
                .on("close", resolve)
                .on("error", reject);
            });
          });
        });
      });

      describe("#getMetadata()", () => {
        it("should throw on non-existing file", async () => {
          let err: any;
          await testBucket
            .file(SMALL_FILE_PATH)
            .getMetadata()
            .catch((_err) => {
              err = _err;
            });

          expect(err).to.not.be.empty;
        });

        it("should return generated metadata for new upload", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .getMetadata();

          const metadataTypes: { [s: string]: string } = {};

          for (const key in metadata) {
            if (metadata[key]) {
              metadataTypes[key] = typeof metadata[key];
            }
          }

          expect(metadata.name).to.equal("small_file");
          expect(metadata.contentType).to.equal("application/octet-stream");
          expect(metadataTypes).to.deep.equal({
            bucket: "string",
            contentDisposition: "string",
            contentEncoding: "string",
            contentType: "string",
            generation: "string",
            md5Hash: "string",
            crc32c: "string",
            cacheControl: "string",
            etag: "string",
            metageneration: "string",
            storageClass: "string",
            name: "string",
            size: "string",
            timeCreated: "string",
            updated: "string",
            id: "string",
            kind: "string",
            mediaLink: "string",
            selfLink: "string",
            timeStorageClassUpdated: "string",
          });
        });

        it("should return generated custom metadata for new upload", async () => {
          const customMetadata = {
            contentDisposition: "initialCommit",
            contentType: "image/jpg",
            name: "test_upload.jpg",
          };

          const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
            .post(
              `/upload/storage/v1/b/${storageBucket}/o?name=test_upload.jpg&uploadType=resumable`
            )
            .send(customMetadata)
            .set({
              Authorization: "Bearer owner",
            })
            .expect(200)
            .then((res) => new URL(res.header["location"]));

          const returnedMetadata = await supertest(STORAGE_EMULATOR_HOST)
            .put(uploadURL.pathname + uploadURL.search)
            .expect(200)
            .then((res) => res.body);

          expect(returnedMetadata.name).to.equal(customMetadata.name);
          expect(returnedMetadata.contentType).to.equal(customMetadata.contentType);
          expect(returnedMetadata.contentDisposition).to.equal(customMetadata.contentDisposition);
        });

        it("should return a functional media link", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [{ mediaLink }] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .getMetadata();

          const requestClient = TEST_CONFIG.useProductionServers ? https : http;
          await new Promise((resolve, reject) => {
            requestClient.get(mediaLink, {}, (response) => {
              const data: any = [];
              response
                .on("data", (chunk) => data.push(chunk))
                .on("end", () => {
                  expect(Buffer.concat(data).length).to.equal(SMALL_FILE_SIZE);
                })
                .on("close", resolve)
                .on("error", reject);
            });
          });
        });

        it("should handle firebaseStorageDownloadTokens", async () => {
          const destination = "public/small_file";
          await testBucket.upload(SMALL_FILE_PATH, {
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
          await supertest(STORAGE_EMULATOR_HOST)
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

        it("should throw 404 object error for file not found", async () => {
          await expect(testBucket.file("blah").getMetadata())
            .to.be.eventually.rejectedWith(`No such object: ${storageBucket}/blah`)
            .and.nested.include({
              code: 404,
              "errors[0].reason": "notFound",
            });
        });
      });

      describe("#setMetadata()", () => {
        it("should throw on non-existing file", async () => {
          let err: any;
          await testBucket
            .file(SMALL_FILE_PATH)
            .setMetadata({ contentType: 9000 })
            .catch((_err) => {
              err = _err;
            });

          expect(err).to.not.be.empty;
        });

        it("should allow overriding of default metadata", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ contentType: "very/fake" });

          const metadataTypes: { [s: string]: string } = {};

          for (const key in metadata) {
            if (metadata[key]) {
              metadataTypes[key] = typeof metadata[key];
            }
          }

          expect(metadata.contentType).to.equal("very/fake");
          expect(metadataTypes).to.deep.equal({
            bucket: "string",
            contentDisposition: "string",
            contentEncoding: "string",
            contentType: "string",
            generation: "string",
            md5Hash: "string",
            crc32c: "string",
            cacheControl: "string",
            etag: "string",
            metageneration: "string",
            storageClass: "string",
            name: "string",
            size: "string",
            timeCreated: "string",
            updated: "string",
            id: "string",
            kind: "string",
            mediaLink: "string",
            selfLink: "string",
            timeStorageClassUpdated: "string",
          });
        });

        it("should allow setting of optional metadata", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ cacheControl: "no-cache", contentLanguage: "en" });

          const metadataTypes: { [s: string]: string } = {};

          for (const key in metadata) {
            if (metadata[key]) {
              metadataTypes[key] = typeof metadata[key];
            }
          }

          expect(metadata.cacheControl).to.equal("no-cache");
          expect(metadata.contentLanguage).to.equal("en");
        });

        it("should not duplicate data when called repeatedly", async () => {
          const destination = "public/small_file";
          await testBucket.upload(SMALL_FILE_PATH, {
            destination,
            metadata: {},
          });

          const cloudFile = testBucket.file(destination);
          const incomingMetadata = {
            metadata: {
              firebaseStorageDownloadTokens: "myFirstToken,mySecondToken",
            },
          };

          // Check that metadata isn't duplicated when setting multiple times in a row
          await cloudFile.setMetadata(incomingMetadata);
          await cloudFile.setMetadata(incomingMetadata);
          await cloudFile.setMetadata(incomingMetadata);

          // Check that the tokens are saved in Firebase metadata
          await supertest(STORAGE_EMULATOR_HOST)
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
          expect(storedMetadata.metadata.firebaseStorageDownloadTokens).to.equal(
            incomingMetadata.metadata.firebaseStorageDownloadTokens
          );
        });

        it("should allow fields under .metadata", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ metadata: { is_over: "9000" } });

          expect(metadata.metadata.is_over).to.equal("9000");
        });

        it("should convert non-string fields under .metadata to strings", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ metadata: { booleanValue: true, numberValue: -1 } });

          expect(metadata.metadata).to.deep.equal({
            booleanValue: "true",
            numberValue: "-1",
          });
        });

        it("should remove fields under .metadata when setting to null", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata1] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ metadata: { foo: "bar", hello: "world" } });

          expect(metadata1.metadata).to.deep.equal({
            foo: "bar",
            hello: "world",
          });

          const [metadata2] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ metadata: { foo: null } });

          expect(metadata2.metadata).to.deep.equal({
            hello: "world",
          });
        });

        it("should ignore any unknown fields", async () => {
          await testBucket.upload(SMALL_FILE_PATH);
          const [metadata] = await testBucket
            .file(SMALL_FILE_PATH.split("/").slice(-1)[0])
            .setMetadata({ nada: "true" });

          expect(metadata.nada).to.be.undefined;
        });
      });
    });
  });

  /**
   * TODO(abhisun): Add test coverage to validate how many times various cloud functions are triggered.
   */
  describe("Firebase Endpoints", () => {
    let browser: puppeteer.Browser;
    let page: puppeteer.Page;

    const filename = "testing/storage_ref/image.png";
    const image_filename = writeToFile(
      "image_base64",
      Buffer.from(IMAGE_FILE_BASE64, "base64"),
      tmpDir
    );

    before(async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);
      browser = await puppeteer.launch({
        headless: !TEST_CONFIG.showBrowser,
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

      await page.evaluate(
        (appConfig, useProductionServers, authEmulatorHost, storageEmulatorHost) => {
          firebase.initializeApp(appConfig);
          if (!useProductionServers) {
            firebase.auth().useEmulator(authEmulatorHost);
            const [storageHost, storagePort] = storageEmulatorHost.split(":") as string[];
            (firebase.storage() as any).useEmulator(storageHost, storagePort);
          }
        },
        appConfig,
        TEST_CONFIG.useProductionServers,
        AUTH_EMULATOR_HOST,
        STORAGE_EMULATOR_HOST.replace(/^(https?:|)\/\//, "")
      );
    });

    beforeEach(async () => {
      await resetEmulatorState();
      await testBucket.upload(image_filename, { destination: filename });
    });

    afterEach(async () => {
      await page.evaluate(async () => {
        await firebase.auth().signOut();
      });
    });

    after(async () => {
      await page.close();
      await browser.close();
    });

    describe(".ref()", () => {
      describe("#put()", () => {
        it("should upload a file", async () => {
          await signInToFirebaseAuth(page);
          const uploadState = await uploadText(
            page,
            "testing/image.png",
            IMAGE_FILE_BASE64,
            "base64"
          );

          expect(uploadState).to.equal("success");
        });

        it("should upload a file with a really long path name to check for os filename character limit", async () => {
          await signInToFirebaseAuth(page);
          const uploadState = await uploadText(
            page,
            `testing/${"long".repeat(180)}image.png`,
            IMAGE_FILE_BASE64,
            "base64"
          );

          expect(uploadState).to.equal("success");
        });

        it("should upload replace existing file", async () => {
          await uploadText(page, "upload/replace.txt", "some-content");
          await uploadText(page, "upload/replace.txt", "some-other-content");

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const downloadUrl = await page.evaluate(() => {
            return firebase.storage().ref("upload/replace.txt").getDownloadURL();
          });

          const requestClient = TEST_CONFIG.useProductionServers ? https : http;
          await new Promise((resolve, reject) => {
            requestClient.get(
              downloadUrl,
              {
                headers: {
                  // This is considered an authorized request in the emulator
                  Authorization: "Bearer owner",
                },
              },
              (response) => {
                const data: any = [];
                response
                  .on("data", (chunk) => data.push(chunk))
                  .on("end", () => {
                    expect(Buffer.concat(data).toString()).to.equal("some-other-content");
                  })
                  .on("close", resolve)
                  .on("error", reject);
              }
            );
          });
        });

        it("should upload a file using put", async () => {
          await signInToFirebaseAuth(page);
          const uploadState = await page.evaluate(async (IMAGE_FILE_BASE64) => {
            const task = await firebase
              .storage()
              .ref("testing/image_put.png")
              .put(new File([IMAGE_FILE_BASE64], "toUpload.txt"));
            return task.state;
          }, IMAGE_FILE_BASE64);

          expect(uploadState).to.equal("success");
        });

        it("should handle uploading empty buffer", async () => {
          await signInToFirebaseAuth(page);
          const uploadState = await page.evaluate(async () => {
            const task = await firebase.storage().ref("testing/empty_file").put(new ArrayBuffer(0));
            return task.state;
          });

          expect(uploadState).to.equal("success");
        });

        it("should upload a file with custom metadata", async () => {
          const uploadState = await page.evaluate(async (IMAGE_FILE_BASE64) => {
            const task = await firebase
              .storage()
              .ref("upload/allowIfContentTypeImage.png")
              .put(new File([IMAGE_FILE_BASE64], "toUpload.txt"), { contentType: "image/blah" });
            return task.state;
          }, IMAGE_FILE_BASE64);

          expect(uploadState).to.equal("success");
        });

        it("should set custom metadata on resumable uploads", async () => {
          const customMetadata = {
            contentDisposition: "initialCommit",
            contentType: "image/jpg",
            name: "test_upload.jpg",
          };

          const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
            .post(
              `/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`
            )
            .send(customMetadata)
            .set({
              Authorization: "Bearer owner",
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "start",
            })
            .expect(200)
            .then((res) => new URL(res.header["x-goog-upload-url"]));

          const returnedMetadata = await supertest(STORAGE_EMULATOR_HOST)
            .put(uploadURL.pathname + uploadURL.search)
            .set({
              "X-Goog-Upload-Protocol": "resumable",
              "X-Goog-Upload-Command": "upload, finalize",
            })
            .expect(200)
            .then((res) => res.body);
          expect(returnedMetadata.name).to.equal(customMetadata.name);
          expect(returnedMetadata.contentType).to.equal(customMetadata.contentType);
          expect(returnedMetadata.contentDisposition).to.equal(customMetadata.contentDisposition);
        });

        it("should return a 403 on rules deny", async () => {
          const uploadState = await page.evaluate(async (IMAGE_FILE_BASE64) => {
            const _file = new File([IMAGE_FILE_BASE64], "toUpload.txt");
            try {
              const task = await firebase
                .storage()
                .ref("upload/allowIfContentTypeImage.png")
                .put(_file, { contentType: "text/plain" });
              return task.state;
            } catch (err: any) {
              if (err instanceof Error) {
                return err.message;
              }
              throw err;
            }
          }, IMAGE_FILE_BASE64);
          expect(uploadState!).to.include("User does not have permission");
        });

        it("should return a 403 on rules deny when overwriting existing file", async () => {
          async function shouldThrowOnUpload() {
            try {
              return await uploadText(
                page,
                "upload/allowIfNoExistingFile.txt",
                "some-other-content"
              );
            } catch (err: any) {
              if (err instanceof Error) {
                return err.message;
              }
              throw err;
            }
          }

          await uploadText(page, "upload/allowIfNoExistingFile.txt", "some-content");

          const uploadState = await shouldThrowOnUpload();
          expect(uploadState!).to.include("User does not have permission");
        });
      });

      describe("#listAll()", () => {
        async function uploadFiles(paths: string[], filename = SMALL_FILE_PATH): Promise<void> {
          await Promise.all(
            paths.map((destination) => testBucket.upload(filename, { destination }))
          );
        }

        async function executeListAllAtPath(path: string): Promise<{
          items: string[];
          prefixes: string[];
        }> {
          return await page.evaluate(async (path) => {
            const list = await firebase.storage().ref(path).listAll();
            return {
              prefixes: list.prefixes.map((prefix) => prefix.name),
              items: list.items.map((item) => item.name),
            };
          }, path);
        }

        it("should list all files and prefixes at path", async () => {
          await uploadFiles([
            "listAll/some/deeply/nested/directory/item1",
            "listAll/item1",
            "listAll/item2",
          ]);

          const listResult = await executeListAllAtPath("listAll/");

          expect(listResult).to.deep.equal({
            items: ["item1", "item2"],
            prefixes: ["some"],
          });
        });

        it("zero element list array should still be present in response", async () => {
          const listResult = await executeListAllAtPath("listAll/");

          expect(listResult).to.deep.equal({
            prefixes: [],
            items: [],
          });
        });

        it("folder placeholder should not be listed under itself", async () => {
          await uploadFiles(["listAll/abc/", EMPTY_FILE_PATH]);

          let listResult = await executeListAllAtPath("listAll/");

          expect(listResult).to.deep.equal({
            prefixes: ["abc"],
            items: [],
          });

          listResult = await executeListAllAtPath("listAll/abc/");

          expect(listResult).to.deep.equal({
            prefixes: [],
            items: [],
          });
        });

        it("should not include show invalid prefixes and items", async () => {
          await uploadFiles(["listAll//foo", "listAll/bar//", "listAll/baz//qux"], EMPTY_FILE_PATH);

          const listResult = await executeListAllAtPath("listAll/");

          expect(listResult).to.deep.equal({
            prefixes: ["bar", "baz"],
            items: [], // no valid items
          });
        });
      });

      describe("#list()", () => {
        async function uploadFiles(paths: string[]): Promise<void> {
          await Promise.all(
            paths.map((destination) => testBucket.upload(SMALL_FILE_PATH, { destination }))
          );
        }
        const itemNames = [...Array(10)].map((_, i) => `item#${i}`);

        beforeEach(async () => {
          await uploadFiles(itemNames.map((name) => `listAll/${name}`));
        });

        it("should list only maxResults items with nextPageToken, when maxResults is set", async () => {
          const listItems = await page.evaluate(async () => {
            const list = await firebase.storage().ref("listAll").list({
              maxResults: 4,
            });
            return {
              items: list.items.map((item) => item.name),
              nextPageToken: list.nextPageToken,
            };
          });

          expect(listItems.items).to.have.lengthOf(4);
          expect(itemNames).to.include.members(listItems.items);
          expect(listItems.nextPageToken).to.not.be.empty;
        });

        it("should paginate when nextPageToken is provided", async () => {
          let responses: string[] = [];
          let pageToken = "";
          let pageCount = 0;

          do {
            const listResponse = await page.evaluate(async (pageToken) => {
              const list = await firebase.storage().ref("listAll").list({
                maxResults: 4,
                pageToken,
              });
              return {
                items: list.items.map((item) => item.name),
                nextPageToken: list.nextPageToken ?? "",
              };
            }, pageToken);

            responses = [...responses, ...listResponse.items];
            pageToken = listResponse.nextPageToken;
            pageCount++;

            if (!listResponse.nextPageToken) {
              expect(responses.sort()).to.deep.equal(itemNames);
              expect(pageCount).to.be.equal(3);
              break;
            }
          } while (true);
        });
      });

      describe("#getDownloadURL()", () => {
        it("returns url pointing to the expected host", async () => {
          await signInToFirebaseAuth(page);
          const downloadUrl: string = await page.evaluate((filename) => {
            return firebase.storage().ref(filename).getDownloadURL();
          }, filename);
          expect(downloadUrl).to.contain(
            `${expectedHost}/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?alt=media&token=`
          );
        });

        it("serves the right content", async () => {
          await signInToFirebaseAuth(page);
          const downloadUrl = await page.evaluate((filename) => {
            return firebase.storage().ref(filename).getDownloadURL();
          }, filename);

          const requestClient = TEST_CONFIG.useProductionServers ? https : http;
          await new Promise((resolve, reject) => {
            requestClient.get(downloadUrl, (response) => {
              const data: any = [];
              response
                .on("data", (chunk) => data.push(chunk))
                .on("end", () => {
                  expect(Buffer.concat(data)).to.deep.equal(
                    Buffer.from(IMAGE_FILE_BASE64, "base64")
                  );
                })
                .on("close", resolve)
                .on("error", reject);
            });
          });
        });
      });

      describe("#getMetadata()", () => {
        it("should return file metadata", async () => {
          await signInToFirebaseAuth(page);
          const metadata = await page.evaluate(async (filename) => {
            return await firebase.storage().ref(filename).getMetadata();
          }, filename);

          const metadataTypes: { [s: string]: string } = {};

          for (const key in metadata) {
            if (metadata[key]) {
              metadataTypes[key] = typeof metadata[key];
            }
          }

          expect(metadataTypes).to.deep.equal({
            bucket: "string",
            contentDisposition: "string",
            contentEncoding: "string",
            contentType: "string",
            cacheControl: "string",
            fullPath: "string",
            generation: "string",
            md5Hash: "string",
            metageneration: "string",
            name: "string",
            size: "number",
            timeCreated: "string",
            type: "string",
            updated: "string",
          });
        });
      });

      describe("#updateMetadata()", () => {
        it("updates metadata successfully", async () => {
          await signInToFirebaseAuth(page);
          const metadata = await page.evaluate(async (filename) => {
            return firebase
              .storage()
              .ref(filename)
              .updateMetadata({
                contentType: "application/awesome-stream",
                customMetadata: {
                  testable: "true",
                },
              });
          }, filename);

          expect(metadata.contentType).to.equal("application/awesome-stream");
          expect(metadata.customMetadata.testable).to.equal("true");
        });

        it("should allow deletion of custom metadata by setting to null", async () => {
          await signInToFirebaseAuth(page);
          const setMetadata = await page.evaluate((filename) => {
            return firebase
              .storage()
              .ref(filename)
              .updateMetadata({
                contentType: "text/plain",
                customMetadata: {
                  removeMe: "please",
                },
              });
          }, filename);

          expect(setMetadata.customMetadata.removeMe).to.equal("please");

          const nulledMetadata = await page.evaluate((filename) => {
            return firebase
              .storage()
              .ref(filename)
              .updateMetadata({
                contentType: "text/plain",
                customMetadata: {
                  removeMe: null as any,
                },
              });
          }, filename);

          expect(nulledMetadata.customMetadata.removeMe).to.equal(undefined);
        });

        it("throws on non-existent file", async () => {
          await signInToFirebaseAuth(page);
          const err = await page.evaluate(async () => {
            try {
              return await firebase
                .storage()
                .ref("testing/thisFileDoesntExist")
                .updateMetadata({
                  contentType: "application/awesome-stream",
                  customMetadata: {
                    testable: "true",
                  },
                });
            } catch (_err) {
              return _err;
            }
          });

          expect(err).to.not.be.empty;
        });
      });

      describe("deleteFile", () => {
        it("should delete file", async () => {
          await signInToFirebaseAuth(page);
          await page.evaluate((filename) => {
            return firebase.storage().ref(filename).delete();
          }, filename);

          const error = await page.evaluate((filename) => {
            return new Promise((resolve) => {
              firebase
                .storage()
                .ref(filename)
                .getDownloadURL()
                .catch((err) => {
                  resolve(err.message);
                });
            });
          }, filename);

          expect(error).to.contain("does not exist.");
        });

        it("should not delete file when security rule on resource object disallows it", async () => {
          await uploadText(page, "delete/disallowIfContentTypeText", "some-content", undefined, {
            contentType: "text/plain",
          });

          const error: string = await page.evaluate(async (filename) => {
            try {
              await firebase.storage().ref(filename).delete();
              return "success";
            } catch (err) {
              if (err instanceof Error) {
                return err.message;
              }
              throw err;
            }
          }, "delete/disallowIfContentTypeText");

          expect(error).to.contain("does not have permission to access");
        });
      });
    });
  });

  describe("Non-SDK Endpoints", () => {
    const filename = "testing/storage_ref/image.png";
    const encoded_filename = "testing%2Fstorage_ref%2Fimage.png";
    const image_filename = writeToFile(
      "image_base64",
      Buffer.from(IMAGE_FILE_BASE64, "base64"),
      tmpDir
    );

    beforeEach(async () => {
      await resetEmulatorState();
      await testBucket.upload(image_filename, { destination: filename });
    });

    describe("tokens", () => {
      it("should generate new token on create_token", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?create_token=true`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const metadata = res.body;
            expect(metadata.downloadTokens.split(",").length).to.deep.equal(1);
          });
      });

      it("should return a 400 if create_token value is invalid", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?create_token=someNonTrueParam`)
          .set({ Authorization: "Bearer owner" })
          .expect(400);
      });

      it("should return a 403 for create_token if auth header is invalid", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?create_token=true`)
          .set({ Authorization: "Bearer somethingElse" })
          .expect(403);
      });

      it("should delete a download token", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?create_token=true`)
          .set({ Authorization: "Bearer owner" })
          .expect(200);
        const tokens = await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?create_token=true`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => res.body.downloadTokens.split(","));
        // delete the newly added token
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?delete_token=${tokens[0]}`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const metadata = res.body;
            expect(metadata.downloadTokens.split(",")).to.deep.equal([tokens[1]]);
          });
      });

      it("should regenerate a new token if the last remaining one is deleted", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?create_token=true`)
          .set({ Authorization: "Bearer owner" })
          .expect(200);
        const token = await supertest(STORAGE_EMULATOR_HOST)
          .get(`/v0/b/${storageBucket}/o/${encoded_filename}`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => res.body.downloadTokens);

        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?delete_token=${token}`)
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
          .post(`/v0/b/${storageBucket}/o/${encoded_filename}?delete_token=someToken`)
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
          .post(
            `/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`
          )
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
          .post(
            `/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`
          )
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
          .post(
            `/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`
          )
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
          .post(
            `/v0/b/${storageBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`
          )
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

  emulatorSpecificDescribe("Internal Endpoints", () => {
    after(async () => {
      // reset to default rules after this test suite finishes.
      await supertest(STORAGE_EMULATOR_HOST)
        .put("/internal/setRules")
        .send({
          rules: {
            files: [
              {
                name: "/dev/null/storage.rules",
                content: DEFAULT_RULES,
              },
            ],
          },
        })
        .expect(200);
    });

    describe("setRules", () => {
      it("should set single ruleset", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [StorageRulesFiles.readWriteIfTrue],
            },
          })
          .expect(200);
      });

      it("should set multiple rules/resource objects", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [
                { resource: "bucket_0", ...StorageRulesFiles.readWriteIfTrue },
                { resource: "bucket_1", ...StorageRulesFiles.readWriteIfAuth },
              ],
            },
          })
          .expect(200);
      });

      it("should overwrite single ruleset with multiple rules/resource objects", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [StorageRulesFiles.readWriteIfTrue],
            },
          })
          .expect(200);

        await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [
                { resource: "bucket_0", ...StorageRulesFiles.readWriteIfTrue },
                { resource: "bucket_1", ...StorageRulesFiles.readWriteIfAuth },
              ],
            },
          })
          .expect(200);
      });

      it("should return 400 if rules.files array is missing", async () => {
        const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({ rules: {} })
          .expect(400)
          .then((res) => res.body.message);

        expect(errorMessage).to.equal("Request body must include 'rules.files' array");
      });

      it("should return 400 if rules.files array has missing name field", async () => {
        const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [{ content: StorageRulesFiles.readWriteIfTrue.content }],
            },
          })
          .expect(400)
          .then((res) => res.body.message);

        expect(errorMessage).to.equal(
          "Each member of 'rules.files' array must contain 'name' and 'content'"
        );
      });

      it("should return 400 if rules.files array has missing content field", async () => {
        const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [{ name: StorageRulesFiles.readWriteIfTrue.name }],
            },
          })
          .expect(400)
          .then((res) => res.body.message);

        expect(errorMessage).to.equal(
          "Each member of 'rules.files' array must contain 'name' and 'content'"
        );
      });

      it("should return 400 if rules.files array has missing resource field", async () => {
        const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [
                { resource: "bucket_0", ...StorageRulesFiles.readWriteIfTrue },
                StorageRulesFiles.readWriteIfAuth,
              ],
            },
          })
          .expect(400)
          .then((res) => res.body.message);

        expect(errorMessage).to.equal(
          "Each member of 'rules.files' array must contain 'name', 'content', and 'resource'"
        );
      });

      it("should return 400 if rules.files array has invalid content", async () => {
        const errorMessage = await supertest(STORAGE_EMULATOR_HOST)
          .put("/internal/setRules")
          .send({
            rules: {
              files: [{ name: StorageRulesFiles.readWriteIfTrue.name, content: "foo" }],
            },
          })
          .expect(400)
          .then((res) => res.body.message);

        expect(errorMessage).to.equal(
          "There was an error updating rules, see logs for more details"
        );
      });
    });
  });
});
