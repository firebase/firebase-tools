import { Bucket, CopyOptions } from "@google-cloud/storage";
import { expect } from "chai";
import * as admin from "firebase-admin";
import * as fs from "fs";
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
import { gunzipSync } from "zlib";

// Test case that should only run when targeting the emulator.
// Example use: emulatorOnly.it("Local only test case", () => {...});
const emulatorOnly = { it: TEST_ENV.useProductionServers ? it.skip : it };

describe("GCS Javascript SDK conformance tests", () => {
  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);
  const emptyFilePath: string = createRandomFile("empty_file", 0, tmpDir);

  const storageBucket = TEST_ENV.appConfig.storageBucket;
  const otherStorageBucket = TEST_ENV.secondTestBucket;
  const storageHost = TEST_ENV.storageHost;
  const googleapisHost = TEST_ENV.googleapisHost;

  let test: EmulatorEndToEndTest;
  let testBucket: Bucket;
  let otherTestBucket: Bucket;
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

    // Init GCS admin SDK.
    const credential = TEST_ENV.prodServiceAccountKeyJson
      ? admin.credential.cert(TEST_ENV.prodServiceAccountKeyJson)
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);
    otherTestBucket = admin.storage().bucket(otherStorageBucket);
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
      it("should handle non-resumable uploads", async () => {
        await testBucket.upload(smallFilePath, {
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

      it("should upload with provided metadata", async () => {
        const metadata = {
          contentDisposition: "attachment",
          cacheControl: "private,max-age=30",
          contentLanguage: "en",
          metadata: { foo: "bar" },
        };
        const [, fileMetadata] = await testBucket.upload(smallFilePath, {
          resumable: false,
          metadata,
        });

        expect(fileMetadata).to.deep.include(metadata);
      });

      it("should upload with proper content type", async () => {
        const jpgFile = createRandomFile("small_file.jpg", SMALL_FILE_SIZE, tmpDir);
        const [, fileMetadata] = await testBucket.upload(jpgFile);

        expect(fileMetadata.contentType).to.equal("image/jpeg");
      });

      it("should handle firebaseStorageDownloadTokens", async () => {
        const testFileName = "public/file";
        await testBucket.upload(smallFilePath, {
          destination: testFileName,
          metadata: {},
        });

        const file = testBucket.file(testFileName);
        const incomingMetadata = {
          metadata: {
            firebaseStorageDownloadTokens: "myFirstToken,mySecondToken",
          },
        };
        await file.setMetadata(incomingMetadata);

        const [storedMetadata] = await file.getMetadata();
        expect(storedMetadata.metadata.firebaseStorageDownloadTokens).to.deep.equal(
          incomingMetadata.metadata.firebaseStorageDownloadTokens,
        );
      });

      it("should be able to upload file named 'prefix/file.txt' when file named 'prefix' already exists", async () => {
        await testBucket.upload(smallFilePath, {
          destination: "prefix",
        });
        await testBucket.upload(smallFilePath, {
          destination: "prefix/file.txt",
        });
      });

      it("should be able to upload file named 'prefix' when file named 'prefix/file.txt' already exists", async () => {
        await testBucket.upload(smallFilePath, {
          destination: "prefix/file.txt",
        });
        await testBucket.upload(smallFilePath, {
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
          [TESTING_FILE, PREFIX_FILE, PREFIX_1_FILE, PREFIX_2_FILE, PREFIX_SUB_DIRECTORY_FILE].map(
            async (f) => {
              await testBucket.upload(smallFilePath, {
                destination: f,
              });
            },
          ),
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
        const res = await testBucket.getFiles({
          autoPaginate: false,
          prefix: "testing/",
        });
        const [files, , { prefixes }] = res;

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
      it("should save", async () => {
        const contents = Buffer.from("hello world");

        const file = testBucket.file("gzippedFile");
        await file.save(contents, { contentType: "text/plain" });

        expect(file.metadata.contentType).to.be.eql("text/plain");
        const [downloadedContents] = await file.download();
        expect(downloadedContents).to.be.eql(contents);
      });

      it("should handle gzipped uploads", async () => {
        const file = testBucket.file("gzippedFile");
        await file.save("hello world", { gzip: true });

        expect(file.metadata.contentEncoding).to.be.eql("gzip");
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
        await testBucket.upload(smallFilePath, {
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
        await testBucket.upload(smallFilePath, {
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
        await testBucket.upload(smallFilePath, {
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
        await testBucket.upload(smallFilePath);
        const [downloadContent] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .download();

        const actualContent = fs.readFileSync(smallFilePath);
        expect(downloadContent).to.deep.equal(actualContent);
      });

      it("should return partial content of the file", async () => {
        await testBucket.upload(smallFilePath);
        const [downloadContent] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          // Request 10 bytes (range requests are inclusive)
          .download({ start: 10, end: 19 });

        const actualContent = fs.readFileSync(smallFilePath).slice(10, 20);
        expect(downloadContent).to.have.lengthOf(10).and.deep.equal(actualContent);
      });

      it("should throw 404 error for file not found", async () => {
        const err = (await expect(testBucket.file("blah").download()).to.be.eventually.rejectedWith(
          `No such object: ${storageBucket}/blah`,
        )) as Error;

        expect(err).to.have.property("code", 404);
        expect(err).not.have.nested.property("errors[0]");
      });

      it("should decompress gzipped file", async () => {
        const contents = Buffer.from("hello world");

        const file = testBucket.file("gzippedFile");
        await file.save(contents, { gzip: true });

        const [downloadedContents] = await file.download();
        expect(downloadedContents).to.be.eql(contents);
      });

      it("should serve gzipped file if decompress option specified", async () => {
        const contents = Buffer.from("hello world");

        const file = testBucket.file("gzippedFile");
        await file.save(contents, { gzip: true });

        const [downloadedContents] = await file.download({ decompress: false });
        expect(downloadedContents).to.not.be.eql(contents);

        const ungzippedContents = gunzipSync(downloadedContents);
        expect(ungzippedContents).to.be.eql(contents);
      });
    });

    describe("#copy()", () => {
      const COPY_DESTINATION_FILENAME = "copied_file";

      it("should copy the file", async () => {
        await testBucket.upload(smallFilePath);

        const file = testBucket.file(COPY_DESTINATION_FILENAME);
        const [, resp] = await testBucket.file(smallFilePath.split("/").slice(-1)[0]).copy(file);

        expect(resp)
          .to.have.all.keys(["kind", "totalBytesRewritten", "objectSize", "done", "resource"])
          .and.include({
            kind: "storage#rewriteResponse",
            totalBytesRewritten: String(SMALL_FILE_SIZE),
            objectSize: String(SMALL_FILE_SIZE),
            done: true,
          });

        const [copiedContent] = await file.download();

        const actualContent = fs.readFileSync(smallFilePath);
        expect(copiedContent).to.deep.equal(actualContent);
      });

      it("should copy the file to a different bucket", async () => {
        await testBucket.upload(smallFilePath);

        const file = otherTestBucket.file(COPY_DESTINATION_FILENAME);
        const [, { resource: metadata }] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .copy(file);

        expect(metadata).to.have.property("bucket", otherStorageBucket);

        const [copiedContent] = await file.download();

        const actualContent = fs.readFileSync(smallFilePath);
        expect(copiedContent).to.deep.equal(actualContent);
      });

      it("should return the metadata of the destination file", async () => {
        await testBucket.upload(smallFilePath);

        const file = testBucket.file(COPY_DESTINATION_FILENAME);
        const [, { resource: actualMetadata }] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .copy(file);

        const [expectedMetadata] = await file.getMetadata();
        delete actualMetadata["owner"];
        expect(actualMetadata).to.deep.equal(expectedMetadata);
      });

      it("should copy the file preserving the original metadata", async () => {
        const [, source] = await testBucket.upload(smallFilePath, {
          metadata: {
            contentType: "image/jpg",
            cacheControl: "private,no-store",
            metadata: {
              hello: "world",
            },
          },
        });

        const file = testBucket.file(COPY_DESTINATION_FILENAME);
        await testBucket.file(smallFilePath.split("/").slice(-1)[0]).copy(file);

        const [metadata] = await file.getMetadata();

        expect(metadata).to.have.all.keys(source).and.deep.include({
          bucket: source.bucket,
          crc32c: source.crc32c,
          cacheControl: source.cacheControl,
          metadata: source.metadata,
        });
      });

      it("should copy the file and overwrite with the provided custom metadata", async () => {
        const [, source] = await testBucket.upload(smallFilePath, {
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
          .file(smallFilePath.split("/").slice(-1)[0])
          .copy(file, copyOpts);

        delete metadata1["owner"];
        expect(metadata1).to.deep.include({
          bucket: source.bucket,
          crc32c: source.crc32c,
          metadata,
          cacheControl,
        });

        // Also double check with a new metadata fetch
        const [metadata2] = await file.getMetadata();
        expect(metadata2).to.deep.equal(metadata1);
      });

      it("should set null custom metadata values to empty strings", async () => {
        const [, source] = await testBucket.upload(smallFilePath);

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
          .file(smallFilePath.split("/").slice(-1)[0])
          .copy(file, copyOpts);

        delete metadata1["owner"];
        expect(metadata1).to.deep.include({
          bucket: source.bucket,
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
        await testBucket.upload(smallFilePath, {
          metadata: {
            metadata: {
              firebaseStorageDownloadTokens,
            },
          },
        });

        const file = testBucket.file(COPY_DESTINATION_FILENAME);
        const [, { resource: metadata }] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .copy(file);

        expect(metadata).to.deep.include({
          metadata: {
            firebaseStorageDownloadTokens,
          },
        });
      });

      it("should remove firebaseStorageDownloadTokens when overwriting custom metadata", async () => {
        await testBucket.upload(smallFilePath, {
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
          .file(smallFilePath.split("/").slice(-1)[0])
          .copy(file, copyOpts);

        expect(metadataOut).to.deep.include({ metadata });
      });

      emulatorOnly.it("should not support the use of a rewriteToken", async () => {
        await testBucket.upload(smallFilePath);

        const file = testBucket.file(COPY_DESTINATION_FILENAME);
        await expect(
          testBucket.file(smallFilePath.split("/").slice(-1)[0]).copy(file, { token: "foo-bar" }),
        ).to.eventually.be.rejected.and.have.property("code", 501);
      });
    });

    describe("#makePublic()", () => {
      it("should no-op", async () => {
        const destination = "a/b";
        await testBucket.upload(smallFilePath, { destination });
        const [aclMetadata] = await testBucket.file(destination).makePublic();

        const generation = aclMetadata.generation;
        delete aclMetadata.generation;

        expect(aclMetadata.kind).to.be.eql("storage#objectAccessControl");
        expect(aclMetadata.object).to.be.eql(destination);
        expect(aclMetadata.id).to.be.eql(
          `${testBucket.name}/${destination}/${generation}/allUsers`,
        );
        expect(aclMetadata.selfLink).to.be.eql(
          `${googleapisHost}/storage/v1/b/${testBucket.name}/o/${encodeURIComponent(
            destination,
          )}/acl/allUsers`,
        );
        expect(aclMetadata.bucket).to.be.eql(testBucket.name);
        expect(aclMetadata.entity).to.be.eql("allUsers");
        expect(aclMetadata.role).to.be.eql("READER");
        expect(aclMetadata.etag).to.be.a("string");
      });

      it("should not interfere with downloading of bytes via public URL", async () => {
        const destination = "a/b";
        await testBucket.upload(smallFilePath, { destination });
        await testBucket.file(destination).makePublic();

        const publicLink = `${storageHost}/${testBucket.name}/${destination}`;

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(publicLink, {}, (response) => {
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
          .file(smallFilePath)
          .getMetadata()
          .catch((_err) => {
            err = _err;
          });

        expect(err).to.not.be.empty;
      });

      it("should return generated metadata for new upload", async () => {
        const fileName = "test_file";
        await testBucket.upload(emptyFilePath, { destination: fileName });

        const [metadata] = await testBucket.file(fileName).getMetadata();

        expect(Object.keys(metadata)).to.have.same.members([
          "kind",
          "id",
          "selfLink",
          "mediaLink",
          "name",
          "bucket",
          "generation",
          "metageneration",
          "contentType",
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
        expect(metadata.id).to.be.include(`${storageBucket}/${fileName}`);
        expect(metadata.selfLink).to.include(
          `${googleapisHost}/storage/v1/b/${storageBucket}/o/${fileName}`,
        );
        expect(metadata.mediaLink).to.include(
          `${storageHost}/download/storage/v1/b/${storageBucket}/o/${fileName}`,
        );
        expect(metadata.mediaLink).to.include(`alt=media`);
        expect(metadata.name).to.be.eql(fileName);
        expect(metadata.bucket).to.be.eql(storageBucket);
        expect(metadata.generation).to.be.a("string");
        expect(metadata.metageneration).to.be.eql("1");
        expect(metadata.contentType).to.be.eql("application/octet-stream");
        expect(metadata.storageClass).to.be.a("string");
        expect(metadata.size).to.be.eql("0");
        expect(metadata.md5Hash).to.be.a("string");
        expect(metadata.crc32c).to.be.a("string");
        expect(metadata.etag).to.be.a("string");
        expect(metadata.timeCreated).to.be.a("string");
        expect(metadata.updated).to.be.a("string");
        expect(metadata.timeStorageClassUpdated).to.be.a("string");
      });

      it("should return a functional media link", async () => {
        await testBucket.upload(smallFilePath);
        const [{ mediaLink }] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .getMetadata();

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(mediaLink, { headers: authHeader }, (response) => {
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
          .file(smallFilePath)
          .setMetadata({ contentType: 9000 })
          .catch((_err) => {
            err = _err;
          });

        expect(err).to.not.be.empty;
      });

      it("should allow overriding of default metadata", async () => {
        await testBucket.upload(smallFilePath);
        const [metadata] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
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
          contentType: "string",
          generation: "string",
          md5Hash: "string",
          crc32c: "string",
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
        await testBucket.upload(smallFilePath);
        const [metadata] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
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

      it("should allow fields under .metadata", async () => {
        await testBucket.upload(smallFilePath);
        const [metadata] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .setMetadata({ metadata: { is_over: "9000" } });

        expect(metadata.metadata.is_over).to.equal("9000");
      });

      it("should convert non-string fields under .metadata to strings", async () => {
        await testBucket.upload(smallFilePath);
        const [metadata] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .setMetadata({ metadata: { booleanValue: true, numberValue: -1 } });

        expect(metadata.metadata).to.deep.equal({
          booleanValue: "true",
          numberValue: "-1",
        });
      });

      it("should remove fields under .metadata when setting to null", async () => {
        await testBucket.upload(smallFilePath);
        const [metadata1] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .setMetadata({ metadata: { foo: "bar", hello: "world" } });

        expect(metadata1.metadata).to.deep.equal({
          foo: "bar",
          hello: "world",
        });

        const [metadata2] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .setMetadata({ metadata: { foo: null } });

        expect(metadata2.metadata).to.deep.equal({
          hello: "world",
        });
      });

      it("should ignore any unknown fields", async () => {
        await testBucket.upload(smallFilePath);
        const [metadata] = await testBucket
          .file(smallFilePath.split("/").slice(-1)[0])
          .setMetadata({ nada: "true" });

        expect(metadata.nada).to.be.undefined;
      });
    });
  });
});
