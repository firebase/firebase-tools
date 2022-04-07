import * as path from "path";
import * as fs from "fs-extra";
import { expect } from "chai";
import supertest = require("supertest");

import { createTmpDir } from "../../../src/test/emulators/fixtures";
import { Emulators } from "../../../src/emulator/types";
import { TriggerEndToEndTest } from "../../integration-helpers/framework";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  FIREBASE_EMULATOR_CONFIG,
  getStorageEmulatorHost,
  readEmulatorConfig,
  TEST_SETUP_TIMEOUT,
} from "../utils";

describe("Import Emulator Data", () => {
  const FIREBASE_PROJECT = "fake-project-id";
  const BUCKET = `${FIREBASE_PROJECT}.appspot.com`;
  const EMULATOR_CONFIG = readEmulatorConfig(FIREBASE_EMULATOR_CONFIG);
  const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(EMULATOR_CONFIG);
  const test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, EMULATOR_CONFIG);

  it("retrieves file from imported flattened emulator data", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    await test.startEmulators([
      "--only",
      Emulators.STORAGE,
      "--import",
      path.join(__dirname, "flattened-emulator-data"),
    ]);

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${BUCKET}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  it("stores only the files as blobs when importing emulator data", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    const exportedData = createTmpDir("exported-emulator-data");

    // Import data and export it again on exit
    await test.startEmulators([
      "--only",
      Emulators.STORAGE,
      "--import",
      path.join(__dirname, "nested-emulator-data"),
      "--export-on-exit",
      exportedData,
    ]);
    await test.stopEmulators();

    expect(fs.readdirSync(path.join(exportedData, "storage_export", "blobs")).length).to.equal(1);
    expect(fs.readdirSync(path.join(exportedData, "storage_export", "blobs"))[0]).to.equal(
      encodeURIComponent(`${BUCKET}/test_upload.jpg`)
    );
  });

  it("retrieves file from imported nested emulator data", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    await test.startEmulators([
      "--only",
      Emulators.STORAGE,
      "--import",
      path.join(__dirname, "nested-emulator-data"),
    ]);

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${BUCKET}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  it("retrieves file from importing previously exported emulator data", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    const exportedData = createTmpDir("exported-emulator-data");

    // Upload file to Storage and export emulator data to tmp directory
    await test.startEmulators(["--only", Emulators.STORAGE, "--export-on-exit", exportedData]);
    const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
      .post(`/v0/b/${BUCKET}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({
        Authorization: "Bearer owner",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
      })
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(STORAGE_EMULATOR_HOST)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      });

    await test.stopEmulators();

    // Import previously exported emulator data and retrieve file from Storage
    await test.startEmulators(["--only", Emulators.STORAGE, "--import", exportedData]);
    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${BUCKET}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  it("retrieves file from importing emulator data previously exported on Windows", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    await test.startEmulators([
      "--only",
      Emulators.STORAGE,
      "--import",
      path.join(__dirname, "windows-emulator-data"),
    ]);

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${BUCKET}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${BUCKET}/o/test-directory%2Ftest_nested_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  afterEach(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });
});
