import supertest = require("supertest");
import { Emulators } from "../../../src/emulator/types";
import { TriggerEndToEndTest } from "../../integration-helpers/framework";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  FIREBASE_EMULATOR_CONFIG,
  getStorageEmulatorHost,
  readEmulatorConfig,
  TEST_SETUP_TIMEOUT,
} from "../utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";

describe("Multiple Storage Deploy Targets", () => {
  let test: TriggerEndToEndTest;
  const allowNoneBucket = `${FIREBASE_PROJECT}.appspot.com`;
  const allowAllBucket = `${FIREBASE_PROJECT}-2.appspot.com`;
  const emulatorConfig = readEmulatorConfig(FIREBASE_EMULATOR_CONFIG);
  const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(emulatorConfig);

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);

    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, emulatorConfig);
    await test.applyTargets(Emulators.STORAGE, "allowNone", allowNoneBucket);
    await test.applyTargets(Emulators.STORAGE, "allowAll", allowAllBucket);
    await test.startEmulators(["--only", Emulators.STORAGE]);
  });

  it("should enforce different rules for different targets", async () => {
    const uploadURL = await supertest(STORAGE_EMULATOR_HOST)
      .post(`/v0/b/${allowNoneBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({ "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start" })
      .expect(200)
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(STORAGE_EMULATOR_HOST)
      .put(uploadURL.pathname + uploadURL.search)
      .set({
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      })
      .expect(403);

    const otherUploadURL = await supertest(STORAGE_EMULATOR_HOST)
      .post(`/v0/b/${allowAllBucket}/o/test_upload.jpg?uploadType=resumable&name=test_upload.jpg`)
      .set({ "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start" })
      .expect(200)
      .then((res) => new URL(res.header["x-goog-upload-url"]));

    await supertest(STORAGE_EMULATOR_HOST)
      .put(otherUploadURL.pathname + otherUploadURL.search)
      .set({
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "upload, finalize",
      })
      .expect(200);
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });
});
