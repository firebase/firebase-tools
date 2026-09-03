import * as mockfs from "mock-fs";
import { expect } from "chai";
import * as sinon from "sinon";

import * as exportHelper from "../extensions/export";
import * as exportCmd from "./ext-export";
import * as prompt from "../prompt";
import { Options } from "../options";
import { ExtensionInstance } from "../extensions/types";

function fakeOptions(force: boolean): Options {
  return {
    nonInteractive: true,
    force: force,
  } as unknown as Options;
}

function fakeInstance(): ExtensionInstance {
  return {} as unknown as ExtensionInstance;
}

describe("ext:export secret ejection", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("passes through if there are no secrets needing ejection", async () => {
    sinon.stub(exportHelper, "secretsNeedingEjection").resolves([]);
    await expect(exportCmd.handleSecretEjection(fakeOptions(false), fakeInstance())).to.not.be
      .rejected;
  });

  it("passes through if the user denies permission to eject secrets", async () => {
    sinon.stub(exportHelper, "secretsNeedingEjection").resolves(["foo/bar", "baz/qux"]);
    sinon.stub(prompt, "confirm").resolves(false);
    await expect(exportCmd.handleSecretEjection(fakeOptions(false), fakeInstance())).to.not.be
      .rejected;
  });

  it("passes through if all secrets successfully eject", async () => {
    sinon.stub(exportHelper, "secretsNeedingEjection").resolves(["foo/bar", "baz/qux"]);
    sinon
      .stub(exportHelper, "ejectSecretsFromInstance")
      .resolves({ success: ["foo/bar", "baz/qux"], fail: [] });
    await expect(exportCmd.handleSecretEjection(fakeOptions(false), fakeInstance())).to.not.be
      .rejected;
  });

  it("kills the command if any secrets fail to eject and --force is off", async () => {
    sinon.stub(exportHelper, "secretsNeedingEjection").resolves(["foo/bar", "baz/qux"]);
    sinon
      .stub(exportHelper, "ejectSecretsFromInstance")
      .resolves({ success: ["foo/bar"], fail: ["baz/qux"] });
    await expect(exportCmd.handleSecretEjection(fakeOptions(false), fakeInstance())).to.be.rejected;
  });

  it("passes through if any secrets fail to eject and --force is on", async () => {
    sinon.stub(exportHelper, "secretsNeedingEjection").resolves(["foo/bar", "baz/qux"]);
    sinon
      .stub(exportHelper, "ejectSecretsFromInstance")
      .resolves({ success: ["foo/bar"], fail: ["baz/qux"] });
    await expect(exportCmd.handleSecretEjection(fakeOptions(true), fakeInstance())).to.not.be
      .rejected;
  });
});

describe("hasNonEmptyProjectEnv", () => {
  afterEach(() => {
    mockfs.restore();
  });

  it("returns false if no env files exist in the directory", () => {
    mockfs({
      "/project/config": {},
    });
    const opts = {
      functionsSource: "my-inst",
      configDir: "/project/config",
      projectId: "my-proj",
      projectDir: "/project",
    };
    expect(exportCmd.hasNonEmptyProjectEnv(opts)).to.be.false;
  });

  it("returns false if .env.<projectId> exists but has 0 bytes (e.g. from kits:install --no-configure)", () => {
    mockfs({
      "/project/config": {
        ".env.my-proj": "",
      },
    });
    const opts = {
      functionsSource: "my-inst",
      configDir: "/project/config",
      projectId: "my-proj",
      projectDir: "/project",
    };
    expect(exportCmd.hasNonEmptyProjectEnv(opts)).to.be.false;
  });

  it("returns true if .env.<projectId> exists with non-zero size", () => {
    mockfs({
      "/project/config": {
        ".env.my-proj": "FOO=bar\n",
      },
    });
    const opts = {
      functionsSource: "my-inst",
      configDir: "/project/config",
      projectId: "my-proj",
      projectDir: "/project",
    };
    expect(exportCmd.hasNonEmptyProjectEnv(opts)).to.be.true;
  });

  it("returns true if .env.<projectAlias> exists with non-zero size", () => {
    mockfs({
      "/project/config": {
        ".env.staging": "FOO=bar\n",
      },
    });
    const opts = {
      functionsSource: "my-inst",
      configDir: "/project/config",
      projectId: "my-proj",
      projectAlias: "staging",
      projectDir: "/project",
    };
    expect(exportCmd.hasNonEmptyProjectEnv(opts)).to.be.true;
  });

  it("ignores non-project .env file", () => {
    mockfs({
      "/project/config": {
        ".env": "FOO=bar\n",
      },
    });
    const opts = {
      functionsSource: "my-inst",
      configDir: "/project/config",
      projectId: "my-proj",
      projectDir: "/project",
    };
    expect(exportCmd.hasNonEmptyProjectEnv(opts)).to.be.false;
  });
});
