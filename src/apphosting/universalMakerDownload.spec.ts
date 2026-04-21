import * as sinon from "sinon";
import { expect } from "chai";
import * as fs from "fs-extra";
import * as downloadUtils from "../downloadUtils";
import { getOrDownloadUniversalMaker } from "./universalMakerDownload";

describe("universalMakerDownload", () => {
  let existsSyncStub: sinon.SinonStub;
  let copySyncStub: sinon.SinonStub;
  let downloadToTmpStub: sinon.SinonStub;
  let validateSizeStub: sinon.SinonStub;
  let validateChecksumStub: sinon.SinonStub;

  let originalPlatform: string;
  let originalArch: string;

  beforeEach(() => {
    originalPlatform = process.platform;
    originalArch = process.arch;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    Object.defineProperty(process, "arch", { value: "x64", configurable: true });

    existsSyncStub = sinon.stub(fs, "existsSync");
    copySyncStub = sinon.stub(fs, "copySync");
    downloadToTmpStub = sinon.stub(downloadUtils, "downloadToTmp");
    validateSizeStub = sinon.stub(downloadUtils, "validateSize");
    validateChecksumStub = sinon.stub(downloadUtils, "validateChecksum");
  });

  afterEach(() => {
    sinon.restore();
    Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    Object.defineProperty(process, "arch", { value: originalArch, configurable: true });
  });

  it("should return cached binary if valid", async () => {
    existsSyncStub.returns(true);
    validateSizeStub.resolves();
    validateChecksumStub.resolves();

    const result = await getOrDownloadUniversalMaker();
    expect(existsSyncStub).to.have.been.calledOnce;
    expect(validateSizeStub).to.have.been.calledOnce;
    expect(validateChecksumStub).to.have.been.calledOnce;
    expect(downloadToTmpStub).to.not.have.been.called;
    expect(result).to.include("universal-maker-linux-x64");
  });

  it("should redownload if cached binary fails validation", async () => {
    existsSyncStub.returns(true);
    // Fail on first call (cache check), succeed on second (downloaded file)
    validateSizeStub.onFirstCall().rejects(new Error("Invalid size"));
    validateSizeStub.onSecondCall().resolves();

    downloadToTmpStub.resolves("/tmp/downloaded_file");
    validateChecksumStub.resolves(); // For the new file

    const result = await getOrDownloadUniversalMaker();
    expect(existsSyncStub).to.have.been.calledOnce;
    expect(validateSizeStub).to.have.been.calledTwice;
    expect(downloadToTmpStub).to.have.been.calledOnce;
    expect(copySyncStub).to.have.been.calledOnce;
    expect(result).to.include("universal-maker-linux-x64");
  });

  it("should download if binary not in cache", async () => {
    existsSyncStub.returns(false);
    downloadToTmpStub.resolves("/tmp/downloaded_file");
    validateSizeStub.resolves();
    validateChecksumStub.resolves();

    const result = await getOrDownloadUniversalMaker();
    expect(existsSyncStub).to.have.been.calledOnce;
    expect(downloadToTmpStub).to.have.been.calledOnce;
    expect(copySyncStub).to.have.been.calledOnce;
    expect(result).to.include("universal-maker-linux-x64");
  });
});
