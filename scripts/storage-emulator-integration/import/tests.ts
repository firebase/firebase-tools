import * as path from "path";
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

describe("Import Emulator Data", () => {
  const FIREBASE_PROJECT = "fake-project-id";
  const bucket = `${FIREBASE_PROJECT}.appspot.com`;
  const emulatorConfig = readEmulatorConfig(FIREBASE_EMULATOR_CONFIG);
  const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(emulatorConfig);
  const test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, emulatorConfig);

  it("retrieves file from imported flattened emulator data", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    await test.startEmulators([
      "--only",
      Emulators.STORAGE,
      "--import",
      path.join(__dirname, "flattened-emulator-data"),
    ]);

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${bucket}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  it("retrieves file from imported nested emulator data", async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    await test.startEmulators([
      "--only",
      Emulators.STORAGE,
      "--import",
      path.join(__dirname, "flattened-emulator-data"),
    ]);

    await supertest(STORAGE_EMULATOR_HOST)
      .get(`/v0/b/${bucket}/o/test_upload.jpg`)
      .set({ Authorization: "Bearer owner" })
      .expect(200);
  });

  afterEach(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    await test.stopEmulators();
  });
});
