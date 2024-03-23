import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import firebasePkg from "firebase/compat/app";
import { applicationDefault, cert, deleteApp, getApp, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import * as fs from "fs";
import * as puppeteer from "puppeteer";
import { TEST_ENV } from "./env";
import { IMAGE_FILE_BASE64 } from "../../../src/test/emulators/fixtures";
import { EmulatorEndToEndTest } from "../../integration-helpers/framework";
import {
  createRandomFile,
  EMULATORS_SHUTDOWN_DELAY_MS,
  resetStorageEmulator,
  SMALL_FILE_SIZE,
  TEST_SETUP_TIMEOUT,
  getTmpDir,
} from "../utils";

const TEST_FILE_NAME = "testing/storage_ref/testFile";

// Test case that should only run when targeting the emulator.
// Example use: emulatorOnly.it("Local only test case", () => {...});
const emulatorOnly = { it: TEST_ENV.useProductionServers ? it.skip : it };

// This is a 'workaround' to prevent typescript from renaming the import. That
// causes issues when page.evaluate is run with the rename, since the renamed
// values don't exist in the created page.
const firebase = firebasePkg;

describe("Firebase Storage JavaScript SDK conformance tests", () => {
  const storageBucket = TEST_ENV.appConfig.storageBucket;
  const expectedFirebaseHost = TEST_ENV.firebaseHost;

  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);
  const emptyFilePath: string = createRandomFile("empty_file", 0, tmpDir);

  let test: EmulatorEndToEndTest;
  let testBucket: Bucket;
  let authHeader: { Authorization: string };
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;

  async function uploadText(
    page: puppeteer.Page,
    filename: string,
    text: string,
    format?: string,
    metadata?: firebasePkg.storage.UploadMetadata,
  ): Promise<string> {
    return page.evaluate(
      async (filename, text, format, metadata) => {
        try {
          const ref = firebase.storage().ref(filename);
          const res = await ref.putString(text, format, JSON.parse(metadata));
          return res.state;
        } catch (err) {
          if (err instanceof Error) {
            throw err.message;
          }
          throw err;
        }
      },
      filename,
      text,
      format ?? "raw",
      JSON.stringify(metadata ?? {}),
    )!;
  }

  async function signInToFirebaseAuth(page: puppeteer.Page): Promise<void> {
    await page.evaluate(async () => {
      await firebase.auth().signInAnonymously();
    });
  }

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
      ? cert(TEST_ENV.prodServiceAccountKeyJson)
      : applicationDefault();
    initializeApp({ credential });
    testBucket = getStorage().bucket(storageBucket);
    authHeader = { Authorization: `Bearer ${await TEST_ENV.adminAccessTokenGetter}` };

    // Init fake browser page.
    browser = await puppeteer.launch({
      headless: !TEST_ENV.showBrowser,
      devtools: true,
    });
    page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "networkidle2" });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/9.16.0/firebase-app-compat.js",
    });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/9.16.0/firebase-auth-compat.js",
    });
    await page.addScriptTag({
      url: "https://www.gstatic.com/firebasejs/9.16.0/firebase-storage-compat.js",
    });

    // Init Firebase app in browser context and maybe set emulator host overrides.
    console.error("we're going to use this config", TEST_ENV.appConfig);
    await page
      .evaluate(
        (appConfig, useProductionServers, authEmulatorHost, storageEmulatorHost) => {
          // throw new Error(window.firebase.toString());
          // if (firebase.apps.length <= 0) {
          firebase.initializeApp(appConfig);
          // }
          if (!useProductionServers) {
            firebase.app().auth().useEmulator(authEmulatorHost);
            const [storageHost, storagePort] = storageEmulatorHost.split(":");
            firebase.app().storage().useEmulator(storageHost, Number(storagePort));
          }
        },
        TEST_ENV.appConfig,
        TEST_ENV.useProductionServers,
        TEST_ENV.authEmulatorHost,
        TEST_ENV.storageEmulatorHost.replace(/^(https?:|)\/\//, ""),
      )
      .catch((reason) => {
        console.error("*** ", reason);
        throw reason;
      });
  });

  beforeEach(async () => {
    await resetState();
  });

  afterEach(async () => {
    await page.evaluate(async () => {
      await firebase.auth().signOut();
    });
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await deleteApp(getApp());
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await page.close();
    await browser.close();

    TEST_ENV.removeEnvVars();
    if (!TEST_ENV.useProductionServers) {
      await test.stopEmulators();
    }
  });

  describe(".ref()", () => {
    describe("#putString()", () => {
      it("should upload a string", async () => {
        await signInToFirebaseAuth(page);
        await page.evaluate(async (ref) => {
          await firebase.storage().ref(ref).putString("hello world");
        }, TEST_FILE_NAME);

        const downloadUrl = await page.evaluate(async (ref) => {
          return await firebase.storage().ref(ref).getDownloadURL();
        }, TEST_FILE_NAME);

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(downloadUrl, { headers: authHeader }, (response) => {
            const data: any = [];
            response
              .on("data", (chunk) => data.push(chunk))
              .on("end", () => {
                expect(Buffer.concat(data).toString()).to.equal("hello world");
              })
              .on("close", resolve)
              .on("error", reject);
          });
        });
      });
    });

    describe("#put()", () => {
      it("should upload a file with a really long path name to check for os filename character limit", async () => {
        await signInToFirebaseAuth(page);
        const uploadState = await uploadText(
          page,
          `testing/${"long".repeat(180)}image.png`,
          IMAGE_FILE_BASE64,
          "base64",
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

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(downloadUrl, { headers: authHeader }, (response) => {
            const data: any = [];
            response
              .on("data", (chunk) => data.push(chunk))
              .on("end", () => {
                expect(Buffer.concat(data).toString()).to.equal("some-other-content");
              })
              .on("close", resolve)
              .on("error", reject);
          });
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
        const [metadata] = await testBucket
          .file("upload/allowIfContentTypeImage.png")
          .getMetadata();
        expect(metadata.contentType).to.equal("image/blah");
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
        expect(uploadState).to.include("User does not have permission");
      });

      it("should return a 403 on rules deny when overwriting existing file", async () => {
        async function shouldThrowOnUpload() {
          try {
            return await uploadText(page, "upload/allowIfNoExistingFile.txt", "some-other-content");
          } catch (err: any) {
            if (err instanceof Error) {
              return err.message;
            }
            throw err;
          }
        }

        await uploadText(page, "upload/allowIfNoExistingFile.txt", "some-content");

        const uploadState = await shouldThrowOnUpload();
        expect(uploadState).to.include("User does not have permission");
      });

      it("should default to application/octet-stream", async () => {
        await signInToFirebaseAuth(page);
        const uploadState = await page.evaluate(async (TEST_FILE_NAME) => {
          const task = await firebase.storage().ref(TEST_FILE_NAME).put(new ArrayBuffer(8));
          return task.state;
        }, TEST_FILE_NAME);

        expect(uploadState).to.equal("success");
        const [metadata] = await testBucket.file(TEST_FILE_NAME).getMetadata();
        expect(metadata.contentType).to.equal("application/octet-stream");
      });
    });

    describe("#listAll()", () => {
      async function uploadFiles(paths: string[], filename = smallFilePath): Promise<void> {
        await Promise.all(paths.map((destination) => testBucket.upload(filename, { destination })));
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
        await uploadFiles(["listAll/abc/", emptyFilePath]);

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
        await uploadFiles(["listAll//foo", "listAll/bar//", "listAll/baz//qux"], emptyFilePath);

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
          paths.map((destination) => testBucket.upload(smallFilePath, { destination })),
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
        await testBucket.upload(emptyFilePath, { destination: TEST_FILE_NAME });
        await signInToFirebaseAuth(page);

        const downloadUrl: string = await page.evaluate((filename) => {
          return firebase.storage().ref(filename).getDownloadURL();
        }, TEST_FILE_NAME);
        expect(downloadUrl).to.contain(
          `${expectedFirebaseHost}/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2FtestFile?alt=media&token=`,
        );
      });

      it("serves the right content", async () => {
        const contents = Buffer.from("hello world");
        await testBucket.file(TEST_FILE_NAME).save(contents);
        await signInToFirebaseAuth(page);

        const downloadUrl = await page.evaluate((filename) => {
          return firebase.storage().ref(filename).getDownloadURL();
        }, TEST_FILE_NAME);

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(downloadUrl, (response) => {
            let data = Buffer.alloc(0);
            expect(response.headers["content-disposition"]).to.be.eql(
              "attachment; filename=testFile",
            );
            response
              .on("data", (chunk) => {
                data = Buffer.concat([data, chunk]);
              })
              .on("end", () => {
                expect(data).to.deep.equal(contents);
              })
              .on("close", resolve)
              .on("error", reject);
          });
        });
      });

      emulatorOnly.it("serves content successfully when spammed with calls", async function (this) {
        this.timeout(10_000);
        const NUMBER_OF_FILES = 100;
        const allFileNames: string[] = [];
        for (let i = 0; i < NUMBER_OF_FILES; i++) {
          const fileName = TEST_FILE_NAME.concat(i.toString());
          allFileNames.push(fileName);
          await testBucket.upload(smallFilePath, { destination: fileName });
        }
        await signInToFirebaseAuth(page);

        const getDownloadUrlPromises: Promise<string>[] = [];
        for (const singleFileName of allFileNames) {
          getDownloadUrlPromises.push(
            page.evaluate((filename) => {
              return firebase.storage().ref(filename).getDownloadURL();
            }, singleFileName),
          );
        }
        const values: string[] = await Promise.all(getDownloadUrlPromises);

        expect(values.length).to.be.equal(NUMBER_OF_FILES);
      });
    });

    describe("#getMetadata()", () => {
      it("should return file metadata", async () => {
        await testBucket.upload(emptyFilePath, {
          destination: TEST_FILE_NAME,
        });
        await signInToFirebaseAuth(page);

        const metadata = await page.evaluate(async (filename) => {
          return await firebase.storage().ref(filename).getMetadata();
        }, TEST_FILE_NAME);

        expect(Object.keys(metadata)).to.have.same.members([
          "type",
          "bucket",
          "generation",
          "metageneration",
          "fullPath",
          "name",
          "size",
          "timeCreated",
          "updated",
          "md5Hash",
          "contentEncoding",
          "contentType",
        ]);
        // Unsure why `type` still exists in practice but not the typing.
        // expect(metadata.type).to.be.eql("file");
        expect(metadata.bucket).to.be.eql(storageBucket);
        expect(metadata.generation).to.be.a("string");
        // Firebase Storage automatically updates metadata with a download token on data or
        // metadata fetch it isn't provided at uplaod time.
        expect(metadata.metageneration).to.be.eql("2");
        expect(metadata.fullPath).to.be.eql(TEST_FILE_NAME);
        expect(metadata.name).to.be.eql("testFile");
        expect(metadata.size).to.be.eql(0);
        expect(metadata.timeCreated).to.be.a("string");
        expect(metadata.updated).to.be.a("string");
        expect(metadata.md5Hash).to.be.a("string");
        expect(metadata.contentEncoding).to.be.eql("identity");
        expect(metadata.contentType).to.be.eql("application/octet-stream");
      });
    });

    describe("#updateMetadata()", () => {
      it("updates metadata successfully", async () => {
        await testBucket.upload(emptyFilePath, { destination: TEST_FILE_NAME });
        await signInToFirebaseAuth(page);

        const metadata = await page.evaluate((filename) => {
          return firebase
            .storage()
            .ref(filename)
            .updateMetadata({
              contentType: "application/awesome-stream",
              customMetadata: {
                testable: "true",
              },
            });
        }, TEST_FILE_NAME);

        expect(metadata.contentType).to.equal("application/awesome-stream");
        expect(metadata.customMetadata?.testable).to.equal("true");
      });

      it("shoud allow deletion of settable metadata fields by setting to null", async () => {
        await testBucket.upload(emptyFilePath, {
          destination: TEST_FILE_NAME,
          metadata: {
            cacheControl: "hello world",
            contentDisposition: "hello world",
            contentEncoding: "hello world",
            contentLanguage: "en",
            contentType: "hello world",
            metadata: { key: "value" },
          },
        });
        await signInToFirebaseAuth(page);

        const updatedMetadata = await page.evaluate((filename) => {
          return firebase.storage().ref(filename).updateMetadata({
            cacheControl: null,
            contentDisposition: null,
            contentEncoding: null,
            contentLanguage: null,
            contentType: null,
            customMetadata: null,
          });
        }, TEST_FILE_NAME);
        expect(Object.keys(updatedMetadata)).to.not.have.members([
          "cacheControl",
          "contentDisposition",
          "contentLanguage",
          "contentType",
          "customMetadata",
        ]);
        expect(updatedMetadata.contentEncoding).to.be.eql("identity");
      });

      it("should allow deletion of custom metadata by setting to null", async () => {
        await testBucket.upload(emptyFilePath, { destination: TEST_FILE_NAME });
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
        }, TEST_FILE_NAME);

        expect(setMetadata.customMetadata!.removeMe).to.equal("please");

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
        }, TEST_FILE_NAME);

        expect(nulledMetadata.customMetadata).to.be.undefined;
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

    describe("#delete()", () => {
      it("should delete file", async () => {
        await testBucket.upload(emptyFilePath, { destination: TEST_FILE_NAME });
        await signInToFirebaseAuth(page);

        await page.evaluate((filename) => {
          return firebase.storage().ref(filename).delete();
        }, TEST_FILE_NAME);

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
        }, TEST_FILE_NAME);

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
