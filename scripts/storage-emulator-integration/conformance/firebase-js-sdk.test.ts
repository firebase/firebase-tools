import { Bucket } from "@google-cloud/storage";
import { expect } from "chai";
import * as firebase from "firebase";
import * as admin from "firebase-admin";
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
  writeToFile,
} from "../utils";

const TEST_FILE_NAME = "testing/storage_ref/testFile";

describe("Firebase Storage JavaScript SDK conformance tests", () => {
  const storageBucket = TEST_ENV.appConfig.storageBucket;
  const expectedFirebaseHost = TEST_ENV.firebaseHost;

  // Temp directory to store generated files.
  const tmpDir = getTmpDir();
  const smallFilePath: string = createRandomFile("small_file", SMALL_FILE_SIZE, tmpDir);
  const emptyFilePath: string = createRandomFile("empty_file", 0, tmpDir);
  const imageFilePath = writeToFile(
    "image_base64",
    Buffer.from(IMAGE_FILE_BASE64, "base64"),
    tmpDir
  );

  let test: EmulatorEndToEndTest;
  let testBucket: Bucket;
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;

  async function uploadText(
    page: puppeteer.Page,
    filename: string,
    text: string,
    format?: string,
    metadata?: firebase.storage.UploadMetadata
  ): Promise<string> {
    return page.evaluate(
      async (filename, text, format, metadata) => {
        try {
          const task = await firebase
            .storage()
            .ref(filename)
            .putString(text, format, JSON.parse(metadata));
          return task.state;
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
      JSON.stringify(metadata ?? {})
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
      ? admin.credential.cert(TEST_ENV.prodServiceAccountKeyJson)
      : admin.credential.applicationDefault();
    admin.initializeApp({ credential });
    testBucket = admin.storage().bucket(storageBucket);

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
      TEST_ENV.storageEmulatorHost.replace(/^(https?:|)\/\//, "")
    );
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
    admin.app().delete();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await page.close();
    await browser.close();

    TEST_ENV.removeEnvVars();
    if (!TEST_ENV.useProductionServers) {
      await test.stopEmulators();
    }
  });

  describe(".ref()", () => {
    describe("#put()", () => {
      it("should upload a file", async () => {
        await signInToFirebaseAuth(page);
        await page.evaluate(async (ref) => {
          await firebase.storage().ref(ref).putString("hello world");
        }, TEST_FILE_NAME);

        const downloadUrl = await page.evaluate(async (ref) => {
          return await firebase.storage().ref(ref).getDownloadURL();
        }, TEST_FILE_NAME);

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(
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
                  expect(Buffer.concat(data).toString()).to.equal("hello world");
                })
                .on("close", resolve)
                .on("error", reject);
            }
          );
        });
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

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(
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
        expect(uploadState!).to.include("User does not have permission");
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
          paths.map((destination) => testBucket.upload(smallFilePath, { destination }))
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
          `${expectedFirebaseHost}/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2FtestFile?alt=media&token=`
        );
      });

      it("serves the right content", async () => {
        await testBucket.upload(imageFilePath, { destination: TEST_FILE_NAME });
        await signInToFirebaseAuth(page);

        const downloadUrl = await page.evaluate((filename) => {
          return firebase.storage().ref(filename).getDownloadURL();
        }, TEST_FILE_NAME);

        await new Promise((resolve, reject) => {
          TEST_ENV.requestClient.get(downloadUrl, (response) => {
            const data: any = [];
            response
              .on("data", (chunk) => data.push(chunk))
              .on("end", () => {
                expect(Buffer.concat(data)).to.deep.equal(Buffer.from(IMAGE_FILE_BASE64, "base64"));
              })
              .on("close", resolve)
              .on("error", reject);
          });
        });
      });
    });

    describe("#getMetadata()", () => {
      // TODO(tonyjhuang): Skip until we have more expressive metadata type checks.
      // it.skip("should return file metadata", async () => {
      //   await testBucket.upload(emptyFilePath, { destination: TEST_FILE_NAME });
      //   await signInToFirebaseAuth(page);
      //   const metadata = await page.evaluate(async (filename) => {
      //     return await firebase.storage().ref(filename).getMetadata();
      //   }, TEST_FILE_NAME);
      //   const metadataTypes: { [s: string]: string } = {};
      //   console.log(metadata);
      //   for (const key in Object.keys(metadata)) {
      //     console.log("KEY: " + key)
      //     metadataTypes[key] = typeof(metadata[key]);
      //   }
      //   expect(metadataTypes).to.deep.equal({
      //     bucket: "string",
      //     contentDisposition: "string",
      //     contentEncoding: "string",
      //     contentType: "string",
      //     cacheControl: "string",
      //     fullPath: "string",
      //     generation: "string",
      //     md5Hash: "string",
      //     metageneration: "string",
      //     name: "string",
      //     size: "number",
      //     timeCreated: "string",
      //     type: "string",
      //     updated: "string",
      //   });
      // });
    });

    describe("#updateMetadata()", () => {
      it("updates metadata successfully", async () => {
        await testBucket.upload(emptyFilePath, { destination: TEST_FILE_NAME });
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
        }, TEST_FILE_NAME);

        expect(metadata.contentType).to.equal("application/awesome-stream");
        expect(metadata.customMetadata?.testable).to.equal("true");
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

        expect(setMetadata.customMetadata?.removeMe).to.equal("please");

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

        expect(nulledMetadata.customMetadata?.removeMe).to.equal(undefined);
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
