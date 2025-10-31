import { expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";
import * as fs from "fs-extra";

import * as downloadableEmulators from "./downloadableEmulators";
import { Emulators } from "./types";
import * as emulatorUpdateDetails from "./downloadableEmulatorInfo.json";

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
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.linux.remoteUrl,
    );

    sandbox.stub(process, "platform").value("win32");
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.win32.remoteUrl,
    );

    sandbox.stub(process, "platform").value("darwin");
    sandbox.stub(process, "arch").value("x64");
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.darwin.remoteUrl,
    );

    sandbox.stub(process, "arch").value("arm64");
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.darwin_arm64.remoteUrl,
    );
  });
});
