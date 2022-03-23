import * as path from "path";
import { expect } from "chai";

import { Options } from "../../../../options";
import { RC } from "../../../../rc";
import { getStorageRulesConfig } from "../../../../emulator/storage/rules/config";
import { createTmpDir, StorageRulesFiles } from "../../fixtures";
import { Persistence } from "../../../../emulator/storage/persistence";
import { FirebaseError } from "../../../../error";
import { RulesConfig } from "../../../../emulator/storage";
import { SourceFile } from "../../../../emulator/storage/rules/types";

const PROJECT_ID = "test-project";

describe("Storage Rules Config", () => {
  const tmpDir = createTmpDir("storage-files");
  const persistence = new Persistence(tmpDir);
  const resolvePath = (fileName: string) => path.resolve(tmpDir, fileName);

  it("should parse rules config for single target", () => {
    const rulesFile = "storage.rules";
    const rulesContent = Buffer.from(StorageRulesFiles.readWriteIfTrue.content);
    persistence.appendBytes(rulesFile, rulesContent);

    const config = getOptions({
      data: { storage: { rules: rulesFile } },
      path: resolvePath,
    });
    const result = getStorageRulesConfig(PROJECT_ID, config) as SourceFile;

    expect(result.name).to.equal(`${tmpDir}/storage.rules`);
    expect(result.content).to.contain("allow read, write: if true");
  });

  it("should parse rules file for multiple targets", () => {
    const mainRulesContent = Buffer.from(StorageRulesFiles.readWriteIfTrue.content);
    const otherRulesContent = Buffer.from(StorageRulesFiles.readWriteIfAuth.content);
    persistence.appendBytes("storage_main.rules", mainRulesContent);
    persistence.appendBytes("storage_other.rules", otherRulesContent);

    const config = getOptions({
      data: {
        storage: [
          { target: "main", rules: "storage_main.rules" },
          { target: "other", rules: "storage_other.rules" },
        ],
      },
      path: resolvePath,
    });
    config.rc.applyTarget(PROJECT_ID, "storage", "main", ["bucket_0", "bucket_1"]);
    config.rc.applyTarget(PROJECT_ID, "storage", "other", ["bucket_2"]);

    const result = getStorageRulesConfig(PROJECT_ID, config) as RulesConfig[];

    expect(result.length).to.equal(3);

    expect(result[0].resource).to.eql("bucket_0");
    expect(result[0].rules.name).to.equal(`${tmpDir}/storage_main.rules`);
    expect(result[0].rules.content).to.contain("allow read, write: if true");

    expect(result[1].resource).to.eql("bucket_1");
    expect(result[1].rules.name).to.equal(`${tmpDir}/storage_main.rules`);
    expect(result[1].rules.content).to.contain("allow read, write: if true");

    expect(result[2].resource).to.eql("bucket_2");
    expect(result[2].rules.name).to.equal(`${tmpDir}/storage_other.rules`);
    expect(result[2].rules.content).to.contain("allow read, write: if request.auth!=null");
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

  it("should throw FirebaseError when rules file is invalid", () => {
    const invalidFileName = "foo";
    const config = getOptions({ data: { storage: { rules: invalidFileName } }, path: resolvePath });
    expect(() => getStorageRulesConfig(PROJECT_ID, config)).to.throw(
      FirebaseError,
      `File not found: ${resolvePath(invalidFileName)}`
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
