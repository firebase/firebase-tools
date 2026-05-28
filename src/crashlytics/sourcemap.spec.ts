import * as chai from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import * as childProcess from "child_process";

import {
  checkGoogleAppID,
  getAppVersion,
  normalizeFileName,
  getLinkedSourceMapPath,
  findSourceMapMappings,
} from "./sourcemap";
import { FirebaseError } from "../error";
import * as utils from "../utils";

const expect = chai.expect;

describe("crashlytics:sourcemap helpers", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("checkGoogleAppID", () => {
    it("should throw a FirebaseError if app ID is not set", () => {
      expect(() => checkGoogleAppID({} as any)).to.throw(
        FirebaseError,
        "set --app <appId> to a valid Firebase application id",
      );
    });

    it("should not throw if app ID is set", () => {
      expect(() => checkGoogleAppID({ app: "1:12345:web:abc" } as any)).to.not.throw();
    });
  });

  describe("normalizeFileName", () => {
    it("should replace all slashes with hyphens", () => {
      expect(normalizeFileName("path/to/some/file.js")).to.equal("path-to-some-file.js");
      expect(normalizeFileName("file.js")).to.equal("file.js");
    });
  });

  describe("getAppVersion", () => {
    let commandExistsSyncStub: sinon.SinonStub;
    let execSyncStub: sinon.SinonStub;

    beforeEach(() => {
      commandExistsSyncStub = sandbox.stub(utils, "commandExistsSync");
      execSyncStub = sandbox.stub(childProcess, "execSync");
    });

    it("should return the custom appVersion if provided", () => {
      expect(getAppVersion({ appVersion: "2.3.4" } as any)).to.equal("2.3.4");
    });

    it("should fall back to git commit hash if available", () => {
      commandExistsSyncStub.withArgs("git").returns(true);
      execSyncStub.withArgs("git rev-parse HEAD").returns(Buffer.from("abc123456"));

      expect(getAppVersion({} as any)).to.equal("abc123456");
    });

    it("should fall back to package.json version if git is not available", () => {
      commandExistsSyncStub.withArgs("git").returns(false);
      commandExistsSyncStub.withArgs("npm").returns(true);
      execSyncStub.withArgs("npm pkg get version").returns(Buffer.from("1.0.1"));

      expect(getAppVersion({} as any)).to.equal("1.0.1");
    });

    it("should return 'unset' if both git and npm fallback fail", () => {
      commandExistsSyncStub.withArgs("git").returns(false);
      commandExistsSyncStub.withArgs("npm").returns(false);

      expect(getAppVersion({} as any)).to.equal("unset");
    });
  });

  describe("getLinkedSourceMapPath", () => {
    it("should return undefined for empty files", async () => {
      const tmpFile = tmp.fileSync({ postfix: ".js" });
      try {
        const result = await getLinkedSourceMapPath(tmpFile.name);
        expect(result).to.be.undefined;
      } finally {
        tmpFile.removeCallback();
      }
    });

    it("should extract correct sourceMappingURL from standard format", async () => {
      const tmpFile = tmp.fileSync({ postfix: ".js" });
      fs.writeFileSync(tmpFile.name, "console.log('hello');\n//# sourceMappingURL=main.js.map");
      try {
        const result = await getLinkedSourceMapPath(tmpFile.name);
        expect(result).to.equal(path.join(path.dirname(tmpFile.name), "main.js.map"));
      } finally {
        tmpFile.removeCallback();
      }
    });

    it("should extract correct sourceMappingURL with trailing newlines/spaces", async () => {
      const tmpFile = tmp.fileSync({ postfix: ".js" });
      fs.writeFileSync(tmpFile.name, "console.log('hello');\n//@ sourceMappingURL=sub/other.js.map  \n\n ");
      try {
        const result = await getLinkedSourceMapPath(tmpFile.name);
        expect(result).to.equal(path.join(path.dirname(tmpFile.name), "sub/other.js.map"));
      } finally {
        tmpFile.removeCallback();
      }
    });
  });

  describe("findSourceMapMappings", () => {
    it("should construct mappings correctly for linked files", async () => {
      const tmpJs = tmp.fileSync({ postfix: ".js" });
      const jsName = path.basename(tmpJs.name);
      const mapName = `${jsName}.map`;
      const tmpMap = path.join(path.dirname(tmpJs.name), mapName);

      fs.writeFileSync(tmpJs.name, `console.log('hello');\n//# sourceMappingURL=${mapName}`);
      fs.writeFileSync(tmpMap, '{"version":3}');

      try {
        const files = [
          { name: tmpJs.name },
          { name: tmpMap },
        ];
        const rootDir = path.dirname(tmpJs.name);
        const results = await findSourceMapMappings(files, rootDir);

        expect(results).to.have.lengthOf(1);
        expect(results[0]).to.deep.equal({
          mapFilePath: tmpMap,
          obfuscatedFilePath: jsName,
        });
      } finally {
        tmpJs.removeCallback();
        try {
          fs.unlinkSync(tmpMap);
        } catch (e) {
          // ignore
        }
      }
    });

    it("should include unlinked map files as themselves", async () => {
      const tmpMap = tmp.fileSync({ postfix: ".js.map" });
      fs.writeFileSync(tmpMap.name, '{"version":3}');
      const mapName = path.basename(tmpMap.name);

      try {
        const files = [{ name: tmpMap.name }];
        const rootDir = path.dirname(tmpMap.name);
        const results = await findSourceMapMappings(files, rootDir);

        expect(results).to.have.lengthOf(1);
        expect(results[0]).to.deep.equal({
          mapFilePath: tmpMap.name,
          obfuscatedFilePath: mapName,
        });
      } finally {
        tmpMap.removeCallback();
      }
    });
  });
});
