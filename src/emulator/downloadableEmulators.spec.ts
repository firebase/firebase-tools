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
  const tempEnvVars: Record<DownloadableEmulator, string> = {
    firestore: "",
    database: "",
    pubsub: "",
  };
  let chmodStub: sinon.SinonStub;
  const originalProcessPlatform = process.platform;
  const originalProcessArch = process.arch;
  beforeEach(() => {
    chmodStub = sinon.stub(fs, "chmodSync").returns();
    tempEnvVars["firestore"] = process.env["FIRESTORE_EMULATOR_BINARY_PATH"] ?? "";
    tempEnvVars["database"] = process.env["DATABASE_EMULATOR_BINARY_PATH"] ?? "";
    tempEnvVars["pubsub"] = process.env["PUBSUB_EMULATOR_BINARY_PATH"] ?? "";
    delete process.env["FIRESTORE_EMULATOR_BINARY_PATH"];
    delete process.env["DATABASE_EMULATOR_BINARY_PATH"];
    delete process.env["PUBSUB_EMULATOR_BINARY_PATH"];
  });

  afterEach(() => {
    chmodStub.restore();
    process.env["FIRESTORE_EMULATOR_BINARY_PATH"] = tempEnvVars["firestore"];
    process.env["DATABASE_EMULATOR_BINARY_PATH"] = tempEnvVars["database"];
    process.env["PUBSUB_EMULATOR_BINARY_PATH"] = tempEnvVars["pubsub"];
    Object.defineProperty(process, "platform", { value: originalProcessPlatform });
    Object.defineProperty(process, "arch", { value: originalProcessArch });
  });
  it("should match the basename of remoteUrl", () => {
    checkDownloadPath(Emulators.FIRESTORE);
    checkDownloadPath(Emulators.DATABASE);
    checkDownloadPath(Emulators.PUBSUB);
  });

  it("should apply environment varable overrides", () => {
    process.env["FIRESTORE_EMULATOR_BINARY_PATH"] = "my/fake/firestore";
    process.env["DATABASE_EMULATOR_BINARY_PATH"] = "my/fake/database";
    process.env["PUBSUB_EMULATOR_BINARY_PATH"] = "my/fake/pubsub";

    expect(downloadableEmulators.getDownloadDetails(Emulators.FIRESTORE).binaryPath).to.equal(
      "my/fake/firestore",
    );
    expect(downloadableEmulators.getDownloadDetails(Emulators.DATABASE).binaryPath).to.equal(
      "my/fake/database",
    );
    expect(downloadableEmulators.getDownloadDetails(Emulators.PUBSUB).binaryPath).to.equal(
      "my/fake/pubsub",
    );
    expect(chmodStub.callCount).to.equal(3);
  });

  it("should select the right binary for the host environment", () => {
    let downloadDetails;
    Object.defineProperty(process, "platform", { value: "linux" });
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.linux.remoteUrl,
    );

    Object.defineProperty(process, "platform", { value: "win32" });
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.win32.remoteUrl,
    );

    Object.defineProperty(process, "platform", { value: "darwin" });

    Object.defineProperty(process, "arch", { value: "x64" });
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.darwin.remoteUrl,
    );

    Object.defineProperty(process, "arch", { value: "arm64" });
    downloadDetails = downloadableEmulators.generateDownloadDetails();
    expect(downloadDetails.dataconnect.opts.remoteUrl).to.equal(
      emulatorUpdateDetails.dataconnect.darwin_arm64.remoteUrl,
    );
  });
});
