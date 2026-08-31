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
