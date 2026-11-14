import { expect } from "chai";
import * as fs from "fs-extra";
import * as sinon from "sinon";

import { command } from "./appdistribution-distribute";
import { AppDistributionClient } from "../appdistribution/client";
import * as distribution from "../appdistribution/distribution";
import { IntegrationState, Release } from "../appdistribution/types";
import * as auth from "../auth";
import * as utils from "../utils";

describe("appdistribution:distribute", () => {
  const app = "1:123456789:ios:abc123";
  const release: Release = {
    name: `projects/123456789/apps/${app}/releases/release-id`,
    releaseNotes: { text: "Existing notes" },
    displayVersion: "1.2.3",
    buildVersion: "42",
    createTime: new Date("2026-01-01T00:00:00Z"),
    firebaseConsoleUri: "https://console.firebase.google.com/project/test/appdistribution",
    testingUri: "https://appdistribution.firebase.google.com/testerapps/test/releases/release-id",
    binaryDownloadUri: "https://firebaseappdistribution.googleapis.com/app-binary-downloads/test",
  };

  let sandbox: sinon.SinonSandbox;
  let uploadStub: sinon.SinonStub;
  let updateReleaseNotesStub: sinon.SinonStub;
  let distributeStub: sinon.SinonStub;
  let awaitTestResultsStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(command, "prepare").resolves();
    sandbox.stub(auth, "setRefreshToken");
    sandbox.stub(fs, "statSync").returns({ isFile: () => true } as fs.Stats);
    sandbox.stub(utils, "logBullet");
    sandbox.stub(utils, "logSuccess");
    sandbox.stub(utils, "logWarning");
    uploadStub = sandbox.stub(distribution, "upload").resolves(release);
    updateReleaseNotesStub = sandbox
      .stub(AppDistributionClient.prototype, "updateReleaseNotes")
      .resolves(undefined);
    distributeStub = sandbox.stub(AppDistributionClient.prototype, "distribute").resolves();
    sandbox.stub(AppDistributionClient.prototype, "getAabInfo").resolves({
      name: `projects/123456789/apps/${app}/aabInfo`,
      integrationState: IntegrationState.INTEGRATED,
      testCertificate: null,
    });
    sandbox.stub(AppDistributionClient.prototype, "createReleaseTest").resolves({
      name: "test-runs/test-id",
      deviceExecutions: [],
    });
    awaitTestResultsStub = sandbox.stub(distribution, "awaitTestResults").resolves();
  });

  afterEach(() => {
    sandbox.restore();
  });

  for (const extension of ["ipa", "apk", "aab"]) {
    it(`returns the complete release for an ${extension.toUpperCase()} upload`, async () => {
      const result = await command.runner()(`app.${extension}`, {
        app,
        token: "test-token",
        json: true,
      });

      expect(result).to.deep.equal(release);
      expect(updateReleaseNotesStub).to.have.been.calledOnceWithExactly(release.name, "");
      expect(distributeStub).to.have.been.calledOnceWithExactly(release.name, [], []);
    });
  }

  it("returns the updated API release after setting notes and distributing", async () => {
    const updatedRelease = { ...release, releaseNotes: { text: "New notes" } };
    updateReleaseNotesStub.resolves(updatedRelease);

    const result = await command.runner()("app.ipa", {
      app,
      token: "test-token",
      json: true,
      releaseNotes: "New notes",
      groups: "qa,beta",
      testers: "tester@example.com",
    });

    expect(result).to.deep.equal(updatedRelease);
    expect(updateReleaseNotesStub).to.have.been.calledOnceWithExactly(release.name, "New notes");
    expect(distributeStub).to.have.been.calledOnceWithExactly(
      release.name,
      ["tester@example.com"],
      ["qa", "beta"],
    );
    sinon.assert.callOrder(uploadStub, updateReleaseNotesStub, distributeStub);
  });

  it("returns the release when no release notes update is requested", async () => {
    const result = await command.runner()("app.ipa", { app, token: "test-token" });

    expect(result).to.deep.equal(release);
    expect(result.releaseNotes).to.deep.equal({ text: "Existing notes" });
  });

  it("propagates an upload failure", async () => {
    uploadStub.rejects(new Error("upload failed"));

    await expect(
      command.runner()("app.ipa", { app, token: "test-token", json: true }),
    ).to.be.rejectedWith("upload failed");
    expect(updateReleaseNotesStub).not.to.have.been.called;
    expect(distributeStub).not.to.have.been.called;
  });

  it("propagates a release notes failure without distributing", async () => {
    updateReleaseNotesStub.rejects(new Error("notes failed"));

    await expect(
      command.runner()("app.ipa", { app, token: "test-token", json: true, releaseNotes: "Notes" }),
    ).to.be.rejectedWith("notes failed");
    expect(distributeStub).not.to.have.been.called;
  });

  it("propagates a distribution failure instead of returning the uploaded release", async () => {
    distributeStub.rejects(new Error("distribution failed"));

    await expect(
      command.runner()("app.ipa", { app, token: "test-token", json: true, groups: "qa" }),
    ).to.be.rejectedWith("distribution failed");
  });

  it("returns the release after blocking tests complete", async () => {
    const result = await command.runner()("app.apk", {
      app,
      token: "test-token",
      json: true,
      testDevices: "model=shiba,version=34,locale=en_US,orientation=portrait",
    });

    expect(result).to.deep.equal(release);
    expect(awaitTestResultsStub).to.have.been.calledOnce;
    sinon.assert.callOrder(distributeStub, awaitTestResultsStub);
  });

  it("propagates a blocking test failure", async () => {
    awaitTestResultsStub.rejects(new Error("test failed"));

    await expect(
      command.runner()("app.apk", {
        app,
        token: "test-token",
        json: true,
        testDevices: "model=shiba,version=34,locale=en_US,orientation=portrait",
      }),
    ).to.be.rejectedWith("test failed");
  });

  it("returns the release without waiting for non-blocking tests", async () => {
    const result = await command.runner()("app.apk", {
      app,
      token: "test-token",
      json: true,
      testDevices: "model=shiba,version=34,locale=en_US,orientation=portrait",
      testNonBlocking: true,
    });

    expect(result).to.deep.equal(release);
    expect(awaitTestResultsStub).not.to.have.been.called;
  });
});
