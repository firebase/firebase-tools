import { expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import * as fs from "fs-extra";

import * as downloadableEmulators from "./downloadableEmulators";
import * as commandUtils from "./commandUtils";
import { Emulators } from "./types";
import * as emulatorUpdateDetails from "./downloadableEmulatorInfo.json";
import * as utils from "../utils";

type DownloadableEmulator = Emulators.FIRESTORE | Emulators.DATABASE | Emulators.PUBSUB;

function checkDownloadPath(name: DownloadableEmulator): void {
  const emulator = downloadableEmulators.getDownloadDetails(name);
  expect(path.basename(emulator.opts.remoteUrl)).to.eq(path.basename(emulator.downloadPath));
}

describe("downloadDetails", () => {
  let sandbox: sinon.SinonSandbox;
  let chmodStub: sinon.SinonStub;
  beforeEach(() => {
    chmodStub = sinon.stub(fs, "chmodSync").returns();
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    chmodStub.restore();
    sandbox.restore();
  });
  it("should match the basename of remoteUrl", () => {
    checkDownloadPath(Emulators.FIRESTORE);
    checkDownloadPath(Emulators.DATABASE);
    checkDownloadPath(Emulators.PUBSUB);
  });

  it("should apply environment varable overrides", () => {
    sandbox.stub(process, "env").value({
      ...process.env,
      FIRESTORE_EMULATOR_BINARY_PATH: "my/fake/firestore",
      DATABASE_EMULATOR_BINARY_PATH: "my/fake/database",
      PUBSUB_EMULATOR_BINARY_PATH: "my/fake/pubsub",
      DATACONNECT_EMULATOR_BINARY_PATH: "my/fake/dataconnect",
    });

    expect(downloadableEmulators.getDownloadDetails(Emulators.FIRESTORE).binaryPath).to.equal(
      "my/fake/firestore",
    );
    expect(downloadableEmulators.getDownloadDetails(Emulators.DATABASE).binaryPath).to.equal(
      "my/fake/database",
    );
    expect(downloadableEmulators.getDownloadDetails(Emulators.PUBSUB).binaryPath).to.equal(
      "my/fake/pubsub",
    );
    expect(downloadableEmulators.getDownloadDetails(Emulators.DATACONNECT).binaryPath).to.equal(
      "my/fake/dataconnect",
    );
    expect(chmodStub.callCount).to.equal(4);
  });

  it("should select the right binary for the host environment", () => {
    let downloadDetails;
    sandbox.stub(process, "platform").value("linux");
    downloadDetails = downloadableEmulators.getDownloadDetails(Emulators.DATACONNECT);
    expect(downloadDetails.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.linux.remoteUrl,
    );

    sandbox.stub(process, "platform").value("win32");
    downloadDetails = downloadableEmulators.getDownloadDetails(Emulators.DATACONNECT);
    expect(downloadDetails.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.win32.remoteUrl,
    );

    sandbox.stub(process, "platform").value("darwin");
    sandbox.stub(process, "arch").value("x64");
    downloadDetails = downloadableEmulators.getDownloadDetails(Emulators.DATACONNECT);
    expect(downloadDetails.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.darwin.remoteUrl,
    );

    sandbox.stub(process, "arch").value("arm64");
    downloadDetails = downloadableEmulators.getDownloadDetails(Emulators.DATACONNECT);
    expect(downloadDetails.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.darwin_arm64.remoteUrl,
    );
  });

  it("should override emulator version when PUBSUB_EMULATOR_VERSION is set", () => {
    const fakeVersion = "1.2.3";
    sandbox.stub(process, "env").value({
      ...process.env,
      PUBSUB_EMULATOR_VERSION: fakeVersion,
    });

    const pubsubEmulatorDetails = downloadableEmulators.getDownloadDetails(Emulators.PUBSUB);
    expect(pubsubEmulatorDetails.version).to.equal(fakeVersion);
    expect(pubsubEmulatorDetails.downloadPath).to.contain(fakeVersion);
    expect(pubsubEmulatorDetails.opts.remoteUrl).to.contain(fakeVersion);
    expect(pubsubEmulatorDetails.opts.skipChecksumAndSize).to.be.true;

    expect(downloadableEmulators.emulatorVersionOverride(Emulators.FIRESTORE)).to.be.undefined;
    expect(downloadableEmulators.emulatorVersionOverride(Emulators.DATABASE)).to.be.undefined;
    expect(downloadableEmulators.emulatorVersionOverride(Emulators.PUBSUB)).to.equal(fakeVersion);
  });

  describe("_getCommand", () => {
    it("should run the Pub/Sub fat jar directly with shell: false on Windows and forward JVM env opts", () => {
      sandbox.stub(utils, "IS_WINDOWS").value(true);
      const envCopy = {
        ...process.env,
        JAVA_OPTS: "-Xmx512m",
        CLOUD_PUBSUB_EMULATOR_OPTS: "-Dfoo=bar",
      };
      delete envCopy.PUBSUB_EMULATOR_BINARY_PATH;
      sandbox.stub(process, "env").value(envCopy);

      const details = downloadableEmulators.getDownloadDetails(Emulators.PUBSUB);
      const expectedJarSuffix = path.join(
        "pubsub-emulator",
        "lib",
        `cloud-pubsub-emulator-${details.version}-all.jar`,
      );

      const cmd = downloadableEmulators._getCommand(Emulators.PUBSUB, {
        host: "127.0.0.1",
        port: 8085,
      });

      expect(cmd.shell).to.be.false;
      expect(cmd.binary).to.equal(commandUtils.getJavaBinary());
      expect(cmd.args.slice(0, 4)).to.deep.equal([
        "-Duser.language=en",
        "-Xmx512m",
        "-Dfoo=bar",
        "-jar",
      ]);
      expect(cmd.args[4].endsWith(expectedJarSuffix)).to.be.true;
      expect(cmd.args).to.include("--port=8085");
      expect(cmd.args).to.include("--host=127.0.0.1");
    });

    it("should respect PUBSUB_EMULATOR_BINARY_PATH and keep shell: true on Windows", () => {
      sandbox.stub(utils, "IS_WINDOWS").value(true);
      sandbox.stub(process, "env").value({
        ...process.env,
        PUBSUB_EMULATOR_BINARY_PATH: "my/custom/pubsub.bat",
      });

      const cmd = downloadableEmulators._getCommand(Emulators.PUBSUB, {});

      expect(cmd.shell).to.be.true;
      expect(cmd.binary).to.equal("my/custom/pubsub.bat");
    });

    it("should use bin/cloud-pubsub-emulator and shell: true on POSIX", () => {
      sandbox.stub(utils, "IS_WINDOWS").value(false);
      const envCopy = { ...process.env };
      delete envCopy.PUBSUB_EMULATOR_BINARY_PATH;
      sandbox.stub(process, "env").value(envCopy);

      const cmd = downloadableEmulators._getCommand(Emulators.PUBSUB, {});

      expect(cmd.shell).to.be.true;
      expect(cmd.binary).to.contain("cloud-pubsub-emulator");
    });

    it("should not enforce the Java 21 gate on Pub/Sub via requiresJava", () => {
      expect(downloadableEmulators.requiresJava(Emulators.PUBSUB)).to.be.false;
    });
  });
});
