import { expect } from "chai";
import * as supertest from "supertest";
import { StorageRulesFiles } from "../../../src/test/emulators/fixtures";
import { TriggerEndToEndTest } from "../../integration-helpers/framework";
import {
  EMULATORS_SHUTDOWN_DELAY_MS,
  getStorageEmulatorHost,
  readEmulatorConfig,
  TEST_SETUP_TIMEOUT,
} from "../utils";

const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "fake-project-id";
const EMULATOR_CONFIG = readEmulatorConfig();
const STORAGE_EMULATOR_HOST = getStorageEmulatorHost(EMULATOR_CONFIG);

describe("Storage emulator internal endpoints", () => {
  let test: TriggerEndToEndTest;

  before(async function (this) {
    this.timeout(TEST_SETUP_TIMEOUT);
    process.env.STORAGE_EMULATOR_HOST = STORAGE_EMULATOR_HOST;
    test = new TriggerEndToEndTest(FIREBASE_PROJECT, __dirname, EMULATOR_CONFIG);
    await test.startEmulators(["--only", "auth,storage"]);
  });

  beforeEach(async () => {
    // Reset emulator to default rules.
    await supertest(STORAGE_EMULATOR_HOST)
      .put("/internal/setRules")
      .send({
        rules: {
          files: [StorageRulesFiles.readWriteIfAuth],
        },
      })
      .expect(200);
  });

  after(async function (this) {
    this.timeout(EMULATORS_SHUTDOWN_DELAY_MS);
    delete process.env.STORAGE_EMULATOR_HOST;
    await test.stopEmulators();
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
        "Each member of 'rules.files' array must contain 'name' and 'content'",
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
        "Each member of 'rules.files' array must contain 'name' and 'content'",
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
        "Each member of 'rules.files' array must contain 'name', 'content', and 'resource'",
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

      expect(errorMessage).to.equal("There was an error updating rules, see logs for more details");
    });
  });
});
