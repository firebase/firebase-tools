import { expect } from "chai";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import { FirebaseError } from "../error";
import {
  getAllLocalTokenNames,
  getAllLocalTokens,
  getLocalConfigPath,
  getLocalToken,
  getLocalTokenName,
  removeLocalTokens,
  saveLocalToken,
} from "./localConfig";

const EXPECTED_COMMENT =
  "This file contains secrets and should not be committed to source repositories";

describe("appcheck localConfig", () => {
  const iosAppId = "1:1234567890:ios:0a1b2c3d4e5f6a7b8c9d0e";
  const webAppId = "1:1234567890:web:abcdef1234567890";
  const dottedAppId = "1:1234567890:android:com.example.app";
  const token1 = "e3d9b1a0-cf48-4389-8d19-482a177ffec8";
  const token2 = "f4e8c2b1-da59-4490-9e20-593b288ffed9";
  const resourceName1 = `projects/1234567890/apps/${iosAppId}/debugTokens/tok-1`;
  const resourceName2 = `projects/1234567890/apps/${webAppId}/debugTokens/tok-2`;

  let sandbox: sinon.SinonSandbox;
  let tempRoot: string;
  let originalXdgConfigHome: string | undefined;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
    delete process.env.XDG_CONFIG_HOME;

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-appcheck-test-"));
    sandbox.stub(os, "homedir").returns(tempRoot);
  });

  afterEach(() => {
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    sandbox.restore();
    fs.removeSync(tempRoot);
  });

  it("resolves getLocalConfigPath under ~/.config/configstore/firebase-appcheck.json", () => {
    expect(getLocalConfigPath()).to.equal(
      path.join(tempRoot, ".config", "configstore", "firebase-appcheck.json"),
    );
  });

  it("returns empty maps and undefined entries without creating file when none exists", () => {
    expect(getAllLocalTokens()).to.deep.equal({});
    expect(getAllLocalTokenNames()).to.deep.equal({});
    expect(getLocalToken(iosAppId)).to.be.undefined;
    expect(getLocalTokenName(iosAppId)).to.be.undefined;
    expect(fs.existsSync(getLocalConfigPath())).to.be.false;
  });

  it("saves and reads tokens including appIds with dots without dot-prop splitting", () => {
    saveLocalToken(iosAppId, token1);
    saveLocalToken(dottedAppId, token2);

    expect(getLocalToken(iosAppId)).to.equal(token1);
    expect(getLocalToken(dottedAppId)).to.equal(token2);
    expect(getAllLocalTokens()).to.deep.equal({
      [iosAppId]: token1,
      [dottedAppId]: token2,
    });

    const rawDisk = JSON.parse(fs.readFileSync(getLocalConfigPath(), "utf8")) as Record<
      string,
      unknown
    >;
    expect(rawDisk).to.deep.equal({
      _comment: EXPECTED_COMMENT,
      tokens: {
        [iosAppId]: token1,
        [dottedAppId]: token2,
      },
    });
  });

  it("persists optional server resource names in tokenNames and cleans them up on overwrite or removal", () => {
    saveLocalToken(iosAppId, token1, resourceName1);
    saveLocalToken(webAppId, token2, resourceName2);

    expect(getLocalTokenName(iosAppId)).to.equal(resourceName1);
    expect(getAllLocalTokenNames()).to.deep.equal({
      [iosAppId]: resourceName1,
      [webAppId]: resourceName2,
    });

    // Overwriting without resourceName clears stale tokenNames entry for that appId.
    saveLocalToken(iosAppId, token2);
    expect(getLocalToken(iosAppId)).to.equal(token2);
    expect(getLocalTokenName(iosAppId)).to.be.undefined;

    // Removing webAppId removes both tokens[webAppId] and tokenNames[webAppId] (omitting empty tokenNames).
    removeLocalTokens([webAppId]);
    expect(getLocalTokenName(webAppId)).to.be.undefined;
    const rawDisk = JSON.parse(fs.readFileSync(getLocalConfigPath(), "utf8")) as Record<
      string,
      unknown
    >;
    expect(rawDisk).to.deep.equal({
      _comment: EXPECTED_COMMENT,
      tokens: {
        [iosAppId]: token2,
      },
    });
  });

  it("preserves unknown top-level fields for forward compatibility when updating tokens", () => {
    const configPath = getLocalConfigPath();
    fs.ensureDirSync(path.dirname(configPath));
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        _comment: EXPECTED_COMMENT,
        tokens: { [iosAppId]: token1 },
        futureSdkMetadata: { schemaVersion: 2 },
      }),
      "utf8",
    );

    saveLocalToken(webAppId, token2);

    const rawDisk = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(rawDisk.futureSdkMetadata).to.deep.equal({ schemaVersion: 2 });
    expect(rawDisk.tokens).to.deep.equal({
      [iosAppId]: token1,
      [webAppId]: token2,
    });
  });

  it("does not write to disk when removeLocalTokens is called with empty or unknown appIds", () => {
    removeLocalTokens([]);
    removeLocalTokens([iosAppId]);

    expect(fs.existsSync(getLocalConfigPath())).to.be.false;
  });

  it("mirrors writes and removals to absolute XDG_CONFIG_HOME when distinct from ~/.config", () => {
    const xdgDir = path.join(tempRoot, "custom-xdg");
    process.env.XDG_CONFIG_HOME = xdgDir;
    const xdgConfigPath = path.join(xdgDir, "configstore", "firebase-appcheck.json");

    saveLocalToken(iosAppId, token1, resourceName1);
    saveLocalToken(webAppId, token2);

    expect(fs.existsSync(getLocalConfigPath())).to.be.true;
    expect(fs.existsSync(xdgConfigPath)).to.be.true;

    const canonicalJson = JSON.parse(fs.readFileSync(getLocalConfigPath(), "utf8")) as Record<
      string,
      unknown
    >;
    const xdgJson = JSON.parse(fs.readFileSync(xdgConfigPath, "utf8")) as Record<string, unknown>;
    expect(canonicalJson).to.deep.equal(xdgJson);

    removeLocalTokens([iosAppId]);

    const updatedXdgJson = JSON.parse(fs.readFileSync(xdgConfigPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(updatedXdgJson).to.deep.equal({
      _comment: EXPECTED_COMMENT,
      tokens: {
        [webAppId]: token2,
      },
    });
  });

  it("ignores relative XDG_CONFIG_HOME paths so secrets are never written into cwd", () => {
    const repoCwd = path.join(tempRoot, "project-repo");
    fs.ensureDirSync(repoCwd);
    const originalCwd = process.cwd();
    process.chdir(repoCwd);
    try {
      process.env.XDG_CONFIG_HOME = ".config";
      saveLocalToken(iosAppId, token1);

      expect(fs.existsSync(getLocalConfigPath())).to.be.true;
      expect(fs.existsSync(path.join(repoCwd, ".config"))).to.be.false;
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("throws FirebaseError without wiping file on invalid JSON instead of truncating to 0 bytes", () => {
    const configPath = getLocalConfigPath();
    fs.ensureDirSync(path.dirname(configPath));
    const corruptContent = `{"tokens": {"${iosAppId}": "${token1}",}}`;
    fs.writeFileSync(configPath, corruptContent, "utf8");

    expect(() => getAllLocalTokens()).to.throw(
      FirebaseError,
      /Failed to parse local App Check config/,
    );
    expect(() => saveLocalToken(webAppId, token2)).to.throw(
      FirebaseError,
      /Failed to parse local App Check config/,
    );
    // File on disk must remain intact for user recovery, never wiped to 0 bytes.
    expect(fs.readFileSync(configPath, "utf8")).to.equal(corruptContent);
  });

  it("handles 0-byte or whitespace-only config files gracefully and enforces 0o600 permissions on write", () => {
    const configPath = getLocalConfigPath();
    fs.ensureDirSync(path.dirname(configPath));
    fs.writeFileSync(configPath, "   \n", { encoding: "utf8", mode: 0o644 });

    expect(getAllLocalTokens()).to.deep.equal({});

    saveLocalToken(iosAppId, token1);
    expect(getLocalToken(iosAppId)).to.equal(token1);
    if (process.platform !== "win32") {
      expect(fs.statSync(configPath).mode & 0o777).to.equal(0o600);
    }
  });

  it("guards against Object.prototype keys in lookups and malformed config files", () => {
    const configPath = getLocalConfigPath();
    fs.ensureDirSync(path.dirname(configPath));
    fs.writeFileSync(
      configPath,
      `{"_comment":"test","tokens":{"${iosAppId}":"${token1}","__proto__":"polluted","constructor":"bad","invalidNum":123,"empty":""}}`,
      "utf8",
    );

    expect(getAllLocalTokens()).to.deep.equal({
      [iosAppId]: token1,
    });
    expect(getLocalToken("toString")).to.be.undefined;
    expect(getLocalToken("constructor")).to.be.undefined;
    expect(getLocalToken("__proto__")).to.be.undefined;
    expect(() => saveLocalToken("__proto__", token1)).to.throw(
      FirebaseError,
      /Invalid Firebase App ID/,
    );
  });
});
