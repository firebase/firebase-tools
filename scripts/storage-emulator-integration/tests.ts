import { expect } from "chai";
import * as admin from "firebase-admin";
import * as firebase from "firebase";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import * as puppeteer from "puppeteer";
import * as request from "request";
import * as crypto from "crypto";
import * as os from "os";
import { Bucket, Storage } from "@google-cloud/storage";
import supertest = require("supertest");

import { IMAGE_FILE_BASE64 } from "../../src/test/emulators/fixtures";
import { FrameworkOptions, TriggerEndToEndTest } from "../integration-helpers/framework";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

/*
 * Various delays that are needed because this test spawns
 * parallel emulator subprocesses.
 */
const TEST_SETUP_TIMEOUT = 60000;
const EMULATORS_SHUTDOWN_DELAY_MS = 5000;

// Flip these flags for options during test debugging
// all should be FALSE on commit
const TEST_CONFIG = {
  // Set this to true to use production servers
  // (useful for writing tests against source of truth)
  useProductionServers: false,

  // Set this to true to log all emulator logs to console
  // (useful for debugging)
  useMockedLogging: false,

  // Set this to true to make the headless chrome window visible
  // (useful for ensuring the browser is running as expected)
  showBrowser: false,

  // Set this to true to keep the browser open after tests finish
  // (useful for checking browser logs for errors)
  keepBrowserOpen: false,
};

// Files contianing the Firebase App Config and Service Account key for
// the app to be used in these tests.This is only applicable if
// TEST_CONFIG.useProductionServers is true
const PROD_APP_CONFIG = "storage-integration-config.json";
const SERVICE_ACCOUNT_KEY = "service-account-key.json";

// Firebase Emulator config, for starting up emulators
const FIREBASE_EMULATOR_CONFIG = "firebase.json";
const SMALL_FILE_SIZE = 200 * 1024; /* 200 kB */
const LARGE_FILE_SIZE = 20 * 1024 * 1024; /* 20 MiB */
// Temp directory to store generated files.
let tmpDir: string;

/**
 * Reads a JSON file in the current directory.
 *
 * @param filename name of the JSON file to be read. Must be in the current directory.
 */
function readJson(filename: string) {
  const fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Can't find file at ${filename}`);
  }
  const data = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(data);
}

function readProdAppConfig() {
  try {
    return readJson(PROD_APP_CONFIG);
  } catch (error) {
    throw new Error(
      `Cannot read the integration config. Please ensure that the file ${PROD_APP_CONFIG} is present in the current directory.`
    );
  }
}

function readEmulatorConfig(): FrameworkOptions {
  try {
    return readJson(FIREBASE_EMULATOR_CONFIG);
  } catch (error) {
    throw new Error(
      `Cannot read the emulator config. Please ensure that the file ${FIREBASE_EMULATOR_CONFIG} is present in the current directory.`
    );
  }
}

function getAuthEmulatorHost(emulatorConfig: FrameworkOptions) {
  const port = emulatorConfig.emulators?.auth?.port;
  if (port) {
    return `http://localhost:${port}`;
  }
  throw new Error("Auth emulator config not found or invalid");
}

function getStorageEmulatorHost(emulatorConfig: FrameworkOptions) {
  const port = emulatorConfig.emulators?.storage?.port;
  if (port) {
    return `http://localhost:${port}`;
  }
  throw new Error("Storage emulator config not found or invalid");
}

function createRandomFile(filename: string, sizeInBytes: number): string {
  if (!tmpDir) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-files"));
  }
  const fullPath = path.join(tmpDir, filename);
  const bytes = crypto.randomBytes(sizeInBytes);
  fs.writeFileSync(fullPath, bytes);

  return fullPath;
}

/**
 * Resets the storage layer of the Storage Emulator.
 */
async function resetStorageEmulator(emulatorHost: string) {
  await new Promise<void>((resolve) => {
    request.post(`${emulatorHost}/internal/reset`, () => {
      resolve();
    });
  });
}

describe("Storage emulator", () => {
  let test: TriggerEndToEndTest;
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;

  let smallFilePath: string;
  let largeFilePath: string;

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

  const emulatorSpecificDescribe = TEST_CONFIG.useProductionServers ? describe.skip : describe;

  describe("Admin SDK Endpoints", function (this) {
    // eslint-disable-next-line @typescript-eslint/no-invalid-this
    this.timeout(TEST_SETUP_TIMEOUT);
    let testBucket: Bucket;

    before(async () => {
      if (!TEST_CONFIG.useProductionServers) {
        process.env.STORAGE_EMULATOR_HOST = STORAGE_EMULATOR_HOST;

        test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, emulatorConfig);
        await test.startEmulators(["--only", "auth,storage"]);
      }

      // TODO: We should not need a real credential for emulator tests, but
      //       today we do.
      const credential = fs.existsSync(path.join(__dirname, SERVICE_ACCOUNT_KEY))
        ? admin.credential.cert(readJson(SERVICE_ACCOUNT_KEY))
        : admin.credential.applicationDefault();

      admin.initializeApp({
        credential,
      });

      testBucket = admin.storage().bucket(storageBucket);

      smallFilePath = createRandomFile("small_file", SMALL_FILE_SIZE);
      largeFilePath = createRandomFile("large_file", LARGE_FILE_SIZE);
    });

    beforeEach(async () => {
      if (!TEST_CONFIG.useProductionServers) {
        await resetStorageEmulator(STORAGE_EMULATOR_HOST);
      } else {
        await testBucket.deleteFiles();
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
          const content1 = createRandomFile("small_content_1", 10);
          const content2 = createRandomFile("small_content_2", 10);
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
          await testBucket.upload(smallFilePath, {
            gzip: true,
          });
        });

        // TODO(abehaskins): This test is temporarily disabled due to a credentials issue
        it.skip("should handle large (resumable) uploads", async () => {
          await testBucket.upload(largeFilePath),
            {
              resumable: true,
            };
        });
      });

      describe("#getFiles()", () => {
        it("should list files", async () => {
          await testBucket.upload(smallFilePath, {
            destination: "testing/shoveler.svg",
          });
          const [files, prefixes] = await testBucket.getFiles({
            directory: "testing",
          });

          expect(prefixes).to.be.undefined;
          expect(files.map((file) => file.name)).to.deep.equal(["testing/shoveler.svg"]);
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

      describe("#delete()", () => {
        it("should properly delete a file from the bucket", async () => {
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
      });

      describe("#makePublic()", () => {
        it("should no-op", async () => {
          const destination = "a/b";
          await testBucket.upload(smallFilePath, { destination });
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
          await testBucket.upload(smallFilePath, { destination });
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
            .file(smallFilePath)
            .getMetadata()
            .catch((_err) => {
              err = _err;
            });

          expect(err).to.not.be.empty;
        });

        it("should return generated metadata for new upload", async () => {
          await testBucket.upload(smallFilePath);
          const [metadata] = await testBucket
            .file(smallFilePath.split("/").slice(-1)[0])
            .getMetadata();

          const metadataTypes: { [s: string]: string } = {};

          for (const key in metadata) {
            if (metadata[key]) {
              metadataTypes[key] = typeof metadata[key];
            }
          }

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

        it("should return a functional media link", async () => {
          await testBucket.upload(smallFilePath);
          const [{ mediaLink }] = await testBucket
            .file(smallFilePath.split("/").slice(-1)[0])
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
          await testBucket.upload(smallFilePath, {
            destination,
            metadata: {},
          });

          const cloudFile = testBucket.file(destination);
          const md = {
            metadata: {
              firebaseStorageDownloadTokens: "myFirstToken,mySecondToken",
            },
          };

          await cloudFile.setMetadata(md);

          // Check that the tokens are saved in Firebase metadata
          await supertest(STORAGE_EMULATOR_HOST)
            .get(`/v0/b/${testBucket.name}/o/${encodeURIComponent(destination)}`)
            .expect(200)
            .then((res) => {
              const firebaseMd = res.body;
              expect(firebaseMd.downloadTokens).to.equal(md.metadata.firebaseStorageDownloadTokens);
            });

          // Check that the tokens are saved in Cloud metadata
          const [metadata] = await cloudFile.getMetadata();
          expect(metadata.metadata.firebaseStorageDownloadTokens).to.deep.equal(
            md.metadata.firebaseStorageDownloadTokens
          );
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

        it("should ignore any unknown fields", async () => {
          await testBucket.upload(smallFilePath);
          const [metadata] = await testBucket
            .file(smallFilePath.split("/").slice(-1)[0])
            .setMetadata({ nada: "true" });

          expect(metadata.nada).to.be.undefined;
        });
      });
    });

    after(async () => {
      if (tmpDir) {
        fs.unlinkSync(smallFilePath);
        fs.unlinkSync(largeFilePath);
        fs.rmdirSync(tmpDir);
      }

      if (!TEST_CONFIG.useProductionServers) {
        delete process.env.STORAGE_EMULATOR_HOST;
        await test.stopEmulators();
      }
    });
  });

  describe("Firebase Endpoints", () => {
    let storage: Storage;

    const filename = "testing/storage_ref/image.png";

    before(async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      if (!TEST_CONFIG.useProductionServers) {
        test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, emulatorConfig);
        await test.startEmulators(["--only", "auth,storage"]);
      } else {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, SERVICE_ACCOUNT_KEY);
        storage = new Storage();
      }

      browser = await puppeteer.launch({
        headless: !TEST_CONFIG.showBrowser,
        devtools: true,
      });
    });

    beforeEach(async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      page = await browser.newPage();
      await page.goto("https://example.com", { waitUntil: "networkidle2" });

      await page.addScriptTag({
        url: "https://www.gstatic.com/firebasejs/7.24.0/firebase-app.js",
      });
      await page.addScriptTag({
        url: "https://www.gstatic.com/firebasejs/7.24.0/firebase-auth.js",
      });
      // url: "https://storage.googleapis.com/fir-tools-builds/firebase-storage-new.js",
      await page.addScriptTag({
        url: TEST_CONFIG.useProductionServers
          ? "https://www.gstatic.com/firebasejs/7.24.0/firebase-storage.js"
          : "https://storage.googleapis.com/fir-tools-builds/firebase-storage.js",
      });

      await page.evaluate(
        (appConfig, useProductionServers, emulatorHost) => {
          firebase.initializeApp(appConfig);
          // Wiring the app to use either the auth emulator or production auth
          // based on the config flag.
          const auth = firebase.auth();
          if (!useProductionServers) {
            auth.useEmulator(emulatorHost);
          }
          (window as any).auth = auth;
        },
        appConfig,
        TEST_CONFIG.useProductionServers,
        AUTH_EMULATOR_HOST
      );

      if (!TEST_CONFIG.useProductionServers) {
        await page.evaluate((hostAndPort) => {
          const [host, port] = hostAndPort.split(":") as string[];
          (firebase.storage() as any).useEmulator(host, port);
        }, STORAGE_EMULATOR_HOST.replace(/^(https?:|)\/\//, ""));
      }
    });

    it("should upload a file", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      const uploadState = await page.evaluate((IMAGE_FILE_BASE64) => {
        const auth = (window as any).auth as firebase.auth.Auth;

        return auth
          .signInAnonymously()
          .then(() => {
            return firebase
              .storage()
              .ref("testing/image.png")
              .putString(IMAGE_FILE_BASE64, "base64");
          })
          .then((task) => {
            return task.state;
          })
          .catch((err) => {
            throw err.message;
          });
      }, IMAGE_FILE_BASE64);

      expect(uploadState).to.equal("success");
    });

    it("should upload replace existing file", async function (this) {
      this.timeout(TEST_SETUP_TIMEOUT);

      const uploadText = (text: string) =>
        page.evaluate((TEXT_FILE) => {
          const auth = (window as any).auth as firebase.auth.Auth;

          return auth
            .signInAnonymously()
            .then(() => {
              return firebase.storage().ref("replace.txt").putString(TEXT_FILE);
            })
            .then((task) => {
              return task.state;
            })
            .catch((err) => {
              throw err.message;
            });
        }, text);

      await uploadText("some-content");
      await uploadText("some-other-content");

      const downloadUrl = await page.evaluate((filename) => {
        return firebase.storage().ref("replace.txt").getDownloadURL();
      }, filename);

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

    it("should upload a file into a directory", async () => {
      const uploadState = await page.evaluate((IMAGE_FILE_BASE64) => {
        const auth = (window as any).auth as firebase.auth.Auth;

        return auth
          .signInAnonymously()
          .then(() => {
            return firebase
              .storage()
              .ref("testing/storage_ref/big/path/image.png")
              .putString(IMAGE_FILE_BASE64, "base64");
          })
          .then((task) => {
            return task.state;
          })
          .catch((err) => {
            throw err.message;
          });
      }, IMAGE_FILE_BASE64);

      expect(uploadState).to.equal("success");
    });

    it("should upload a file using put", async () => {
      const uploadState = await page.evaluate((IMAGE_FILE_BASE64) => {
        const auth = (window as any).auth as firebase.auth.Auth;
        const _file = new File([IMAGE_FILE_BASE64], "toUpload.txt");
        return auth
          .signInAnonymously()
          .then(() => {
            return firebase.storage().ref("image_put.png").put(_file);
          })
          .then((task) => {
            return task.state;
          })
          .catch((err) => {
            throw err.message;
          });
      }, IMAGE_FILE_BASE64);

      expect(uploadState).to.equal("success");
    });

    describe(".ref()", () => {
      beforeEach(async function (this) {
        this.timeout(TEST_SETUP_TIMEOUT);

        if (!TEST_CONFIG.useProductionServers) {
          await resetStorageEmulator(STORAGE_EMULATOR_HOST);
        } else {
          await storage.bucket(storageBucket).deleteFiles();
        }

        await page.evaluate(
          (IMAGE_FILE_BASE64, filename) => {
            const auth = (window as any).auth as firebase.auth.Auth;

            return auth
              .signInAnonymously()
              .then(() => {
                return firebase.storage().ref(filename).putString(IMAGE_FILE_BASE64, "base64");
              })
              .then((task) => {
                return task.state;
              })
              .catch((err) => {
                throw err.message;
              });
          },
          IMAGE_FILE_BASE64,
          filename
        );
      });

      describe("#listAll()", () => {
        beforeEach(async function (this) {
          this.timeout(TEST_SETUP_TIMEOUT);

          const refs = [
            "testing/storage_ref/image.png",
            "testing/somePathEndsWithDoubleSlash//file.png",
          ];
          for (const ref of refs) {
            await page.evaluate(
              async (IMAGE_FILE_BASE64, filename) => {
                const auth = (window as any).auth as firebase.auth.Auth;

                try {
                  await auth.signInAnonymously();
                  const task = await firebase
                    .storage()
                    .ref(filename)
                    .putString(IMAGE_FILE_BASE64, "base64");
                  return task.state;
                } catch (err) {
                  throw err.message;
                }
              },
              IMAGE_FILE_BASE64,
              ref
            );
          }
        });

        it("should list all files and prefixes", async function (this) {
          this.timeout(TEST_SETUP_TIMEOUT);

          const itemNames = [...Array(5)].map((_, i) => `item#${i}`);
          for (const item of itemNames) {
            await page.evaluate(
              async (IMAGE_FILE_BASE64, filename) => {
                const auth = (window as any).auth as firebase.auth.Auth;

                try {
                  await auth.signInAnonymously();
                  const task = await firebase
                    .storage()
                    .ref(filename)
                    .putString(IMAGE_FILE_BASE64, "base64");
                  return task.state;
                } catch (err) {
                  throw err.message;
                }
              },
              IMAGE_FILE_BASE64,
              `testing/${item}`
            );
          }

          const listResult = await page.evaluate(() => {
            return firebase
              .storage()
              .ref("testing")
              .listAll()
              .then((list) => {
                return {
                  prefixes: list.prefixes.map((prefix) => prefix.name),
                  items: list.items.map((item) => item.name),
                };
              });
          });

          expect(listResult).to.deep.equal({
            items: itemNames,
            prefixes: ["somePathEndsWithDoubleSlash", "storage_ref"],
          });
        });

        it("should list implicit prefixes", async () => {
          await page.evaluate(
            async (IMAGE_FILE_BASE64, filename) => {
              try {
                await firebase.auth().signInAnonymously();
                const task = await firebase
                  .storage()
                  .ref(filename)
                  .putString(IMAGE_FILE_BASE64, "base64");
                return task.state;
              } catch (err) {
                throw err.message;
              }
            },
            IMAGE_FILE_BASE64,
            `testing/implicit/deep/path/file.jpg`
          );

          const listResult = await page.evaluate(() => {
            return firebase
              .storage()
              .ref("testing/implicit")
              .listAll()
              .then((list) => {
                return {
                  prefixes: list.prefixes.map((prefix) => prefix.name),
                  items: list.items.map((item) => item.name),
                };
              });
          });

          expect(listResult).to.deep.equal({
            prefixes: ["deep"],
            items: [],
          });
        });

        it("should list at /", async () => {
          await page.evaluate(
            async (IMAGE_FILE_BASE64, filename) => {
              const auth = (window as any).auth as firebase.auth.Auth;
              try {
                await auth.signInAnonymously();
                const task = await firebase
                  .storage()
                  .ref(filename)
                  .putString(IMAGE_FILE_BASE64, "base64");
                return task.state;
              } catch (err) {
                throw err.message;
              }
            },
            IMAGE_FILE_BASE64,
            `file.jpg`
          );

          const listResult = await page.evaluate(() => {
            return firebase
              .storage()
              .ref()
              .listAll()
              .then((list) => {
                return {
                  prefixes: list.prefixes.map((prefix) => prefix.name),
                  items: list.items.map((item) => item.name),
                };
              });
          });

          expect(listResult).to.deep.equal({
            prefixes: ["testing"],
            items: ["file.jpg"],
          });
        });
      });

      describe("#list()", () => {
        const itemNames = [...Array(10)].map((_, i) => `item#${i}`);

        beforeEach(async function (this) {
          this.timeout(TEST_SETUP_TIMEOUT);

          for (const item of itemNames) {
            await page.evaluate(
              async (IMAGE_FILE_BASE64, filename) => {
                const auth = (window as any).auth as firebase.auth.Auth;

                try {
                  await auth.signInAnonymously();
                  const task = await firebase
                    .storage()
                    .ref(filename)
                    .putString(IMAGE_FILE_BASE64, "base64");
                  return task.state;
                } catch (err) {
                  throw err.message;
                }
              },
              IMAGE_FILE_BASE64,
              `testing/list/${item}`
            );
          }
        });

        it("should list only maxResults items with nextPageToken, when maxResults is set", async function (this) {
          this.timeout(TEST_SETUP_TIMEOUT);

          const listItems = await page.evaluate(() => {
            return firebase
              .storage()
              .ref("testing/list")
              .list({
                maxResults: 4,
              })
              .then((list) => {
                return {
                  items: list.items.map((item) => item.name),
                  nextPageToken: list.nextPageToken,
                };
              });
          });

          expect(listItems.items).to.have.lengthOf(4);
          expect(itemNames).to.include.members(listItems.items);
          expect(listItems.nextPageToken).to.not.be.empty;
        });

        it("should paginate when nextPageToken is provided", async function (this) {
          this.timeout(TEST_SETUP_TIMEOUT);
          let responses: string[] = [];
          let pageToken = "";
          let pageCount = 0;

          do {
            const listResponse = await page.evaluate((pageToken) => {
              return firebase
                .storage()
                .ref("testing/list")
                .list({
                  maxResults: 4,
                  pageToken,
                })
                .then((list) => {
                  return {
                    items: list.items.map((item) => item.name),
                    nextPageToken: list.nextPageToken ?? "",
                  };
                });
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

      it("updateMetadata throws on non-existent file", async () => {
        const err = await page.evaluate(() => {
          return firebase
            .storage()
            .ref("testing/thisFileDoesntExist")
            .updateMetadata({
              contentType: "application/awesome-stream",
              customMetadata: {
                testable: "true",
              },
            })
            .catch((_err) => {
              return _err;
            });
        });

        expect(err).to.not.be.empty;
      });

      it("updateMetadata updates metadata successfully", async () => {
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
        }, filename);

        expect(metadata.contentType).to.equal("application/awesome-stream");
        expect(metadata.customMetadata.testable).to.equal("true");
      });

      describe("#getDownloadURL()", () => {
        it("returns url pointing to the expected host", async () => {
          let downloadUrl;
          try {
            downloadUrl = await page.evaluate((filename) => {
              return firebase.storage().ref(filename).getDownloadURL();
            }, filename);
          } catch (err) {
            expect(err).to.equal("");
          }
          const expectedHost = TEST_CONFIG.useProductionServers
            ? "https://firebasestorage.googleapis.com"
            : STORAGE_EMULATOR_HOST;

          expect(downloadUrl).to.contain(
            `${expectedHost}/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?alt=media&token=`
          );
        });

        it("serves the right content", async () => {
          const downloadUrl = await page.evaluate((filename) => {
            return firebase.storage().ref(filename).getDownloadURL();
          }, filename);

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
                    expect(Buffer.concat(data)).to.deep.equal(
                      Buffer.from(IMAGE_FILE_BASE64, "base64")
                    );
                  })
                  .on("close", resolve)
                  .on("error", reject);
              }
            );
          });
        });
      });

      it("#getMetadata()", async () => {
        const metadata = await page.evaluate((filename) => {
          return firebase.storage().ref(filename).getMetadata();
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

      describe("#setMetadata()", () => {
        it("should allow for custom metadata to be set", async () => {
          const metadata = await page.evaluate((filename) => {
            return firebase
              .storage()
              .ref(filename)
              .updateMetadata({
                customMetadata: {
                  is_over: "9000",
                },
              })
              .then(() => {
                return firebase.storage().ref(filename).getMetadata();
              });
          }, filename);

          expect(metadata.customMetadata.is_over).to.equal("9000");
        });

        it("should allow deletion of custom metadata by setting to null", async () => {
          const setMetadata = await page.evaluate((filename) => {
            const storageReference = firebase.storage().ref(filename);
            return storageReference.updateMetadata({
              contentType: "text/plain",
              customMetadata: {
                removeMe: "please",
              },
            });
          }, filename);

          expect(setMetadata.customMetadata.removeMe).to.equal("please");

          const nulledMetadata = await page.evaluate((filename) => {
            const storageReference = firebase.storage().ref(filename);
            return storageReference.updateMetadata({
              contentType: "text/plain",
              customMetadata: {
                removeMe: null as any,
              },
            });
          }, filename);

          expect(nulledMetadata.customMetadata.removeMe).to.equal(undefined);
        });
      });

      it("#delete()", async () => {
        const downloadUrl = await page.evaluate((filename) => {
          return firebase.storage().ref(filename).getDownloadURL();
        }, filename);

        expect(downloadUrl).to.be.not.null;

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
    });

    emulatorSpecificDescribe("Non-SDK Endpoints", () => {
      beforeEach(async () => {
        if (!TEST_CONFIG.useProductionServers) {
          await resetStorageEmulator(STORAGE_EMULATOR_HOST);
        } else {
          await storage.bucket(storageBucket).deleteFiles();
        }

        await page.evaluate(
          (IMAGE_FILE_BASE64, filename) => {
            const auth = (window as any).auth as firebase.auth.Auth;

            return auth
              .signInAnonymously()
              .then(() => {
                return firebase.storage().ref(filename).putString(IMAGE_FILE_BASE64, "base64");
              })
              .then((task) => {
                return task.state;
              })
              .catch((err) => {
                throw err.message;
              });
          },
          IMAGE_FILE_BASE64,
          filename
        );
      });

      it("#addToken", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?create_token=true`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const md = res.body;
            expect(md.downloadTokens.split(",").length).to.deep.equal(2);
          });
      });

      it("#addTokenWithBadParamIsBadRequest", async () => {
        await supertest(STORAGE_EMULATOR_HOST)
          .post(
            `/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?create_token=someNonTrueParam`
          )
          .set({ Authorization: "Bearer owner" })
          .expect(400);
      });

      it("#deleteToken", async () => {
        const tokens = await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?create_token=true`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const md = res.body;
            const tokens = md.downloadTokens.split(",");
            expect(tokens.length).to.equal(2);

            return tokens;
          });
        // delete the newly added token
        await supertest(STORAGE_EMULATOR_HOST)
          .post(
            `/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?delete_token=${tokens[0]}`
          )
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const md = res.body;
            expect(md.downloadTokens.split(",")).to.deep.equal([tokens[1]]);
          });
      });

      it("#deleteLastTokenStillLeavesOne", async () => {
        const token = await supertest(STORAGE_EMULATOR_HOST)
          .get(`/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const md = res.body;
            return md.downloadTokens;
          });

        // deleting the only token still generates one.
        await supertest(STORAGE_EMULATOR_HOST)
          .post(`/v0/b/${storageBucket}/o/testing%2Fstorage_ref%2Fimage.png?delete_token=${token}`)
          .set({ Authorization: "Bearer owner" })
          .expect(200)
          .then((res) => {
            const md = res.body;
            expect(md.downloadTokens.split(",").length).to.deep.equal(1);
            expect(md.downloadTokens.split(",")).to.not.deep.equal([token]);
          });
      });
    });

    after(async function (this) {
      this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);

      if (!TEST_CONFIG.keepBrowserOpen) {
        await browser.close();
      }
      if (!TEST_CONFIG.useProductionServers) {
        await test.stopEmulators();
      } else {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      }
    });
  });
});
