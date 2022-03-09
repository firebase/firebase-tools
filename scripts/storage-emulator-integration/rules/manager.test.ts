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
    { resource: "bucket_1", rules: StorageRulesFiles.readWriteIfTrue },
    { resource: "bucket_2", rules: StorageRulesFiles.readWriteIfAuth },
  ];
  let rulesManager = createStorageRulesManager(rules, rulesRuntime);

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TIMEOUT_MED);

  before(async () => {
    await rulesRuntime.start();
    await rulesManager.start();
  });

  after(async () => {
    rulesRuntime.stop();
    await rulesManager.close();
  });

  it("should load multiple rulesets on start", () => {
    expect(rulesManager.getRuleset("bucket_1")).not.to.be.undefined;
    expect(rulesManager.getRuleset("bucket_2")).not.to.be.undefined;
  });

  it("should load single ruleset on start", async () => {
    const otherRulesManager = createStorageRulesManager(
      StorageRulesFiles.readWriteIfTrue,
      rulesRuntime
    );
    await otherRulesManager.start();

    expect(otherRulesManager.getRuleset("default")).not.to.be.undefined;

    await otherRulesManager.close();
  });

  it("should load ruleset on update with SourceFile object", async () => {
    await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue, "bucket_3");
    expect(rulesManager.getRuleset("bucket_3")).not.to.be.undefined;
  });

  it("should load ruleset on update with file path", async () => {
    // Write rules to file
    const fileName = "storage.rules";
    const testDir = fs.mkdtempSync(path.join(tmpdir(), "storage-files"));
    const persistence = new Persistence(testDir);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    await rulesManager.setSourceFile(`${testDir}/${fileName}`, "bucket_3");

    expect(rulesManager.getRuleset("bucket_3")).not.to.be.undefined;
  });

  it("should set source file", async () => {
    await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue, "bucket_3");
    const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket_3/o/" };
    expect((await rulesManager.getRuleset("bucket_3")!.verify(opts)).permitted).to.be.true;

    const issues = await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfAuth, "bucket_3");

    expect(issues.errors.length).to.equal(0);
    expect(issues.warnings.length).to.equal(0);
    expect((await rulesManager.getRuleset("bucket_3")!.verify(opts)).permitted).to.be.false;
  });

  it("should reload ruleset on changes to source file", async () => {
    const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket_3/o/" };

    // Write rules to file
    const fileName = "storage.rules";
    const testDir = fs.mkdtempSync(path.join(tmpdir(), "storage-files"));
    const persistence = new Persistence(testDir);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    await rulesManager.setSourceFile(`${testDir}/${fileName}`, "bucket_3");
    expect((await rulesManager.getRuleset("bucket_3")!.verify(opts)).permitted).to.be.true;

    // Write new rules to file
    persistence.deleteFile(fileName);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfAuth.content));

    await rulesManager.setSourceFile(`${testDir}/${fileName}`, "bucket_3");
    expect((await rulesManager.getRuleset("bucket_3")!.verify(opts)).permitted).to.be.false;
  });

  it("should throw FirebaseError when attempting to set invalid source file", async () => {
    const invalidFileName = "foo";
    await expect(rulesManager.setSourceFile(invalidFileName, "bucket_3")).to.be.rejectedWith(
      FirebaseError,
      `File not found: ${invalidFileName}`
    );
  });

  it("should delete ruleset when storage manager is closed", async () => {
    await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue, "bucket_3");
    expect(rulesManager.getRuleset("bucket_3")).not.to.be.undefined;

    await rulesManager.close();
    expect(rulesManager.getRuleset("bucket_3")).to.be.undefined;
  });
});
