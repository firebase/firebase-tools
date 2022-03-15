import { expect } from "chai";
import { tmpdir } from "os";
import { v4 as uuidv4 } from "uuid";

import { FirebaseError } from "../../../../error";
import { StorageRulesFiles, TIMEOUT_MED } from "../../fixtures";
import { StorageRulesManager } from "../../../../emulator/storage/rules/manager";
import { StorageRulesRuntime } from "../../../../emulator/storage/rules/runtime";
import { Persistence } from "../../../../emulator/storage/persistence";
import { RulesetOperationMethod } from "../../../../emulator/storage/rules/types";

// TODO(hsinpei: Make this an integration test
describe.skip("Storage Rules Manager", function () {
  const rulesRuntime = new StorageRulesRuntime();
  const rulesManager = new StorageRulesManager(rulesRuntime);

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TIMEOUT_MED);

  before(async () => {
    await rulesRuntime.start();
  });

  after(async () => {
    rulesRuntime.stop();
    await rulesManager.close();
  });

  it("should load ruleset from SourceFile object", async () => {
    await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue);
    expect(rulesManager.ruleset).not.to.be.undefined;
  });

  it("should load ruleset from file path", async () => {
    // Write rules to file
    const fileName = "storage.rules";
    const testDir = `${tmpdir()}/${uuidv4()}`;
    const persistence = new Persistence(testDir);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    await rulesManager.setSourceFile(`${testDir}/${fileName}`);

    expect(rulesManager.ruleset).not.to.be.undefined;
  });

  it("should set source file", async () => {
    await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue);
    const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket/o/" };
    expect((await rulesManager.ruleset!.verify(opts)).permitted).to.be.true;

    const issues = await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfAuth);

    expect(issues.errors.length).to.equal(0);
    expect(issues.warnings.length).to.equal(0);
    expect((await rulesManager.ruleset!.verify(opts)).permitted).to.be.false;
  });

  it("should reload ruleset on changes to source file", async () => {
    const opts = { method: RulesetOperationMethod.GET, file: {}, path: "/b/bucket/o/" };

    // Write rules to file
    const fileName = "storage.rules";
    const testDir = `${tmpdir()}/${uuidv4()}`;
    const persistence = new Persistence(testDir);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    await rulesManager.setSourceFile(`${testDir}/${fileName}`);
    expect((await rulesManager.ruleset!.verify(opts)).permitted).to.be.true;

    // Write new rules to file
    persistence.deleteFile(fileName);
    persistence.appendBytes(fileName, Buffer.from(StorageRulesFiles.readWriteIfAuth.content));

    await rulesManager.setSourceFile(`${testDir}/${fileName}`);
    expect((await rulesManager.ruleset!.verify(opts)).permitted).to.be.false;
  });

  it("should throw FirebaseError when attempting to set invalid source file", async () => {
    const invalidFileName = "foo";
    await expect(rulesManager.setSourceFile(invalidFileName)).to.be.rejectedWith(
      FirebaseError,
      `File not found: ${invalidFileName}`
    );
  });

  it("should delete ruleset when storage manager is closed", async () => {
    await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue);
    expect(rulesManager.ruleset).not.to.be.undefined;

    await rulesManager.close();
    expect(rulesManager.ruleset).to.be.undefined;
  });
});
