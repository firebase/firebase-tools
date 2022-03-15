import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import { tmpdir } from "os";

import { FirebaseError } from "../../../src/error";
import { StorageRulesFiles, TIMEOUT_MED } from "../../../src/test/emulators/fixtures";
import { StorageRulesManager } from "../../../src/emulator/storage/rules/manager";
import { StorageRulesRuntime } from "../../../src/emulator/storage/rules/runtime";
import { Persistence } from "../../../src/emulator/storage/persistence";
import { RulesetOperationMethod } from "../../../src/emulator/storage/rules/types";

describe("Storage Rules Manager", function () {
  const rulesRuntime = new StorageRulesRuntime();
  const rules = [
    { resource: "bucket_0", rules: StorageRulesFiles.readWriteIfTrue },
    { resource: "bucket_1", rules: StorageRulesFiles.readWriteIfAuth },
  ];
  const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket_2/o/" };
  let rulesManager: StorageRulesManager;

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TIMEOUT_LONG);

  beforeEach(async () => {
    await rulesRuntime.start();

    rulesManager = createStorageRulesManager(rules, rulesRuntime);
    await rulesManager.start();
  });

  afterEach(async () => {
    rulesRuntime.stop();
    await rulesManager.stop();
  });

  it("should load multiple rulesets on start", () => {
    expect(rulesManager.getRuleset("bucket_0")).not.to.be.undefined;
    expect(rulesManager.getRuleset("bucket_1")).not.to.be.undefined;
  });

  it("should load single ruleset on start", async () => {
    const otherRulesManager = createStorageRulesManager(
      StorageRulesFiles.readWriteIfTrue,
      rulesRuntime
    );
    await otherRulesManager.start();

    expect(otherRulesManager.getRuleset("default")).not.to.be.undefined;

    await otherRulesManager.stop();
  });

  it("should load ruleset on update with SourceFile object", async () => {
    await rulesManager.updateSourceFile(StorageRulesFiles.readWriteIfTrue, "bucket_2");
    expect(rulesManager.getRuleset("bucket_2")).not.to.be.undefined;
  });

  it("should set source file", async () => {
    await rulesManager.updateSourceFile(StorageRulesFiles.readWriteIfTrue, "bucket_2");

    expect(await isPermitted({ ...opts, ruleset: rulesManager.getRuleset("bucket_2")! })).to.be
      .true;

    const issues = await rulesManager.updateSourceFile(
      StorageRulesFiles.readWriteIfAuth,
      "bucket_2"
    );

    expect(issues.errors.length).to.equal(0);
    expect(issues.warnings.length).to.equal(0);
    expect(await isPermitted({ ...opts, ruleset: rulesManager.getRuleset("bucket_2")! })).to.be
      .false;
  });

  it("should reload ruleset on changes to source file", async () => {
    // Write rules to file
    const fileName = "storage.rules";
    const testDir = fs.mkdtempSync(path.join(tmpdir(), "storage-files"));
    const persistence = new Persistence(testDir);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    const sourceFile = getSourceFile(testDir, fileName);
    await rulesManager.updateSourceFile(sourceFile, "bucket_2");
    expect(await isPermitted({ ...opts, ruleset: rulesManager.getRuleset("bucket_2")! })).to.be
      .true;

    // Write new rules to file
    persistence.deleteFile(fileName);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfAuth.content));

    // await rulesManager.setSourceFile(sourceFile, "bucket_2");
    expect(await isPermitted(opts)).to.be.false;
  });

  it("should delete ruleset when storage manager is stopped", async () => {
    await rulesManager.updateSourceFile(StorageRulesFiles.readWriteIfTrue, "bucket_2");
    expect(rulesManager.getRuleset("bucket_2")).not.to.be.undefined;

    await rulesManager.stop();
    expect(rulesManager.getRuleset("bucket_2")).to.be.undefined;
  });
});

function getSourceFile(testDir: string, fileName: string): SourceFile {
  const filePath = `${testDir}/${fileName}`;
  return { name: filePath, content: readFile(filePath) };
}
