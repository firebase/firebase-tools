import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import { tmpdir } from "os";

import { Options } from "../../../../options";
import { RC } from "../../../../rc";
import { getStorageRulesConfig } from "../../../../emulator/storage/rules/config";
import { StorageRulesFiles } from "../../fixtures";
import { Persistence } from "../../../../emulator/storage/persistence";
import { FirebaseError } from "../../../../error";

const PROJECT_ID = "test-project";

describe("Storage Rules Config", () => {
  const tmpDir = fs.mkdtempSync(path.join(tmpdir(), "storage-files"));
  const persistence = new Persistence(tmpDir);
  const resolvePath = (fileName: string) => path.resolve(tmpDir, fileName);

  it("should parse rules config for single target", () => {
    const rulesFile = "storage.rules";
    persistence.appendBytes(rulesFile, Buffer.from(StorageRulesFiles.readWriteIfTrue.content));

    const config = getOptions({
      data: { storage: { rules: rulesFile } },
      path: resolvePath,
    });
    const result = getStorageRulesConfig(PROJECT_ID, config);

    expect(result.length).to.equal(1);
    expect(result[0].rules).to.equal(`${tmpDir}/storage.rules`);
  });

  it("should parse rules file for multiple targets", () => {
    const config = getOptions({
      data: {
        storage: [
          { target: "main", rules: "storage_main.rules" },
          { target: "other", rules: "storage_other.rules" },
        ],
      },
      path: resolvePath,
    });
    config.rc.applyTarget(PROJECT_ID, "storage", "main", ["bucket_1", "bucket_2"]);
    config.rc.applyTarget(PROJECT_ID, "storage", "other", ["bucket_3"]);

    const result = getStorageRulesConfig(PROJECT_ID, config);

    expect(result.length).to.equal(3);
    expect(result[0]).to.eql({ resource: "bucket_1", rules: `${tmpDir}/storage_main.rules` });
    expect(result[1]).to.eql({ resource: "bucket_2", rules: `${tmpDir}/storage_main.rules` });
    expect(result[2]).to.eql({ resource: "bucket_3", rules: `${tmpDir}/storage_other.rules` });
  });

  it("should throw FirebaseError when storage config is missing", () => {
    const config = getOptions({ data: {}, path: resolvePath });
    expect(() => getStorageRulesConfig(PROJECT_ID, config)).to.throw(
      FirebaseError,
      "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
    );
  });

  it("should throw FirebaseError when rules file is missing", () => {
    const config = getOptions({ data: { storage: {} }, path: resolvePath });
    expect(() => getStorageRulesConfig(PROJECT_ID, config)).to.throw(
      FirebaseError,
      "Cannot start the Storage emulator without rules file specified in firebase.json: run 'firebase init' and set up your Storage configuration"
    );
  });
});

function getOptions(config: any): Options {
  return {
    cwd: "/",
    configPath: "/",
    /* eslint-disable-next-line */
    config,
    only: "",
    except: "",
    nonInteractive: false,
    json: false,
    interactive: false,
    debug: false,
    force: false,
    filteredTargets: [],
    rc: new RC(),
    project: PROJECT_ID,
  };
}
