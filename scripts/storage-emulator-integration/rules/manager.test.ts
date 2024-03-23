import { expect } from "chai";

import { createTmpDir, StorageRulesFiles } from "../../../src/test/emulators/fixtures";
import { createStorageRulesManager } from "../../../src/emulator/storage/rules/manager";
import { StorageRulesRuntime } from "../../../src/emulator/storage/rules/runtime";
import * as fs from "fs";
import { RulesetOperationMethod, SourceFile } from "../../../src/emulator/storage/rules/types";
import { isPermitted } from "../../../src/emulator/storage/rules/utils";
import { readFile } from "../../../src/fsutils";
import * as path from "path";

const EMULATOR_LOAD_RULESET_DELAY_MS = 20000;
const SETUP_TIMEOUT = 60000;
const PROJECT_ID = "demo-project-id";

describe("Storage Rules Manager", () => {
  let rulesRuntime: StorageRulesRuntime;
  const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket_0/o/" };

  before(async function (this) {
    this.timeout(SETUP_TIMEOUT);
    rulesRuntime = new StorageRulesRuntime();
    await rulesRuntime.start();
  });

  after(async function (this) {
    this.timeout(SETUP_TIMEOUT);
    await rulesRuntime.stop();
  });

  it("should load multiple rulesets on start", async function (this) {
    this.timeout(SETUP_TIMEOUT);
    const rules = [
      { resource: "bucket_0", rules: StorageRulesFiles.readWriteIfTrue },
      { resource: "bucket_1", rules: StorageRulesFiles.readWriteIfAuth },
    ];
    const rulesManager = createStorageRulesManager(rules, rulesRuntime);
    await rulesManager.start();

    const bucket0Ruleset = rulesManager.getRuleset("bucket_0");
    expect(
      await isPermitted({
        ...opts,
        path: "/b/bucket_0/o/",
        ruleset: bucket0Ruleset!,
        projectId: PROJECT_ID,
      }),
    ).to.be.true;

    const bucket1Ruleset = rulesManager.getRuleset("bucket_1");
    expect(
      await isPermitted({
        ...opts,
        path: "/b/bucket_1/o/",
        ruleset: bucket1Ruleset!,
        projectId: PROJECT_ID,
      }),
    ).to.be.false;

    await rulesManager.stop();
  });

  it("should load single ruleset on start", async function (this) {
    this.timeout(SETUP_TIMEOUT);
    // Write rules to file
    const fileName = "storage.rules";
    const testDir = createTmpDir("storage-files");
    appendBytes(testDir, fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    const sourceFile = getSourceFile(testDir, fileName);
    const rulesManager = createStorageRulesManager(sourceFile, rulesRuntime);
    await rulesManager.start();

    const ruleset = rulesManager.getRuleset("bucket");
    expect(await isPermitted({ ...opts, ruleset: ruleset!, projectId: PROJECT_ID })).to.be.true;

    await rulesManager.stop();
  });

  it("should reload ruleset on changes to source file", async function (this) {
    this.timeout(SETUP_TIMEOUT);
    // Write rules to file
    const fileName = "storage.rules";
    const testDir = createTmpDir("storage-files");
    appendBytes(testDir, fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    const sourceFile = getSourceFile(testDir, fileName);
    const rulesManager = createStorageRulesManager(sourceFile, rulesRuntime);
    await rulesManager.start();

    expect(
      await isPermitted({
        ...opts,
        ruleset: rulesManager.getRuleset("bucket")!,
        projectId: PROJECT_ID,
      }),
    ).to.be.true;

    // Write new rules to file
    deleteFile(testDir, fileName);
    appendBytes(testDir, fileName, Buffer.from(StorageRulesFiles.readWriteIfAuth.content));

    await new Promise((resolve) => setTimeout(resolve, EMULATOR_LOAD_RULESET_DELAY_MS));
    expect(
      await isPermitted({
        ...opts,
        ruleset: rulesManager.getRuleset("bucket")!,
        projectId: PROJECT_ID,
      }),
    ).to.be.false;

    await rulesManager.stop();
  });
});

function getSourceFile(testDir: string, fileName: string): SourceFile {
  const filePath = `${testDir}/${fileName}`;
  return { name: filePath, content: readFile(filePath) };
}

function appendBytes(dirPath: string, fileName: string, bytes: Buffer): void {
  const filepath = path.join(dirPath, encodeURIComponent(fileName));
  fs.appendFileSync(filepath, bytes);
}

function deleteFile(dirPath: string, fileName: string): void {
  const filepath = path.join(dirPath, encodeURIComponent(fileName));
  fs.unlinkSync(filepath);
}
