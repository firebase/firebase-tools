import { expect } from "chai";

import { StorageRulesFiles, TIMEOUT_MED } from "../../fixtures";
import { StorageRulesManager } from "../../../../emulator/storage/rules/manager";
import { StorageRulesRuntime } from "../../../../emulator/storage/rules/runtime";

describe("Storage Rules Manager", function () {
  const rulesRuntime = new StorageRulesRuntime();
  let rulesManager: StorageRulesManager;

  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(10000);

  before(async () => {
    await rulesRuntime.start();
    rulesManager = await StorageRulesManager.createInstance(
      StorageRulesFiles.readWriteIfAuth,
      rulesRuntime
    );
  });

  after(async () => {
    rulesRuntime.stop();
    await rulesManager.watcher.close();
  });

  it("should load ruleset", () => {
    expect(rulesManager.ruleset).not.to.be.undefined;
  });

  it("should update source file", async () => {
    const issues = await rulesManager.setSourceFile(StorageRulesFiles.readWriteIfTrue);
    expect(issues.errors.length).to.equal(0);
    expect(issues.warnings.length).to.equal(0);
  });
});
