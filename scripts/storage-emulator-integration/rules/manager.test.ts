import { expect } from "chai";

import {
  createTmpDir,
  StorageRulesFiles,
  TIMEOUT_LONG,
} from "../../../src/test/emulators/fixtures";
import {
  createStorageRulesManager,
  StorageRulesManager,
} from "../../../src/emulator/storage/rules/manager";
import { StorageRulesRuntime } from "../../../src/emulator/storage/rules/runtime";
import { Persistence } from "../../../src/emulator/storage/persistence";
import { RulesetOperationMethod, SourceFile } from "../../../src/emulator/storage/rules/types";
import { isPermitted } from "../../../src/emulator/storage/rules/utils";
import { readFile } from "../../../src/fsutils";

const EMULATOR_LOAD_RULESET_DELAY_MS = 2000;

describe("Storage Rules Manager", function () {
  const rulesRuntime = new StorageRulesRuntime();
  const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket_0/o/" };
  let rulesManager: StorageRulesManager;

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TIMEOUT_LONG);

  beforeEach(async () => {
    await rulesRuntime.start();
  });

  afterEach(async () => {
    rulesRuntime.stop();
    await rulesManager.stop();
  });

  it("should load multiple rulesets on start", async () => {
    const rules = [
      { resource: "bucket_0", rules: StorageRulesFiles.readWriteIfTrue },
      { resource: "bucket_1", rules: StorageRulesFiles.readWriteIfAuth },
    ];
    rulesManager = createStorageRulesManager(rules, rulesRuntime);
    await rulesManager.start();

    const bucket0Ruleset = rulesManager.getRuleset("bucket_0");
    expect(await isPermitted({ ...opts, path: "/b/bucket_0/o/", ruleset: bucket0Ruleset! })).to.be
      .true;

    const bucket1Ruleset = rulesManager.getRuleset("bucket_1");
    expect(await isPermitted({ ...opts, path: "/b/bucket_1/o/", ruleset: bucket1Ruleset! })).to.be
      .false;
  });

  it("should load single ruleset on start", async () => {
    rulesManager = createStorageRulesManager(StorageRulesFiles.readWriteIfTrue, rulesRuntime);
    await rulesManager.start();

    const ruleset = rulesManager.getRuleset("bucket");
    expect(await isPermitted({ ...opts, ruleset: ruleset! })).to.be.true;
  });

  it("should reload ruleset on changes to source file", async () => {
    // Write rules to file
    const fileName = "storage.rules";
    const testDir = createTmpDir("storage-files");
    const persistence = new Persistence(testDir);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    const sourceFile = getSourceFile(testDir, fileName);
    rulesManager = createStorageRulesManager(sourceFile, rulesRuntime);
    await rulesManager.start();

    expect(await isPermitted({ ...opts, ruleset: rulesManager.getRuleset("bucket")! })).to.be.true;

    // Write new rules to file
    persistence.deleteFile(fileName);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfAuth.content));

    await new Promise((resolve) => setTimeout(resolve, EMULATOR_LOAD_RULESET_DELAY_MS));
    expect(await isPermitted({ ...opts, ruleset: rulesManager.getRuleset("bucket")! })).to.be.false;
  });
});

function getSourceFile(testDir: string, fileName: string): SourceFile {
  const filePath = `${testDir}/${fileName}`;
  return { name: filePath, content: readFile(filePath) };
}
