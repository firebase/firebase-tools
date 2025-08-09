import { expect } from "chai";
import * as sinon from "sinon";
import { Command } from "../command";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import { ShaCertificateType } from "../management/apps";
import * as utils from "../utils";
import { command, getCertHashType } from "./apps-android-sha-create";
import * as auth from "../requireAuth";

describe("apps:android:sha:create", () => {
  let sandbox: sinon.SinonSandbox;
  let needProjectIdStub: sinon.SinonStub;
  let createAppAndroidShaStub: sinon.SinonStub;
  let promiseWithSpinnerStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(auth, "requireAuth").resolves();
    needProjectIdStub = sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    createAppAndroidShaStub = sandbox
      .stub(apps, "createAppAndroidSha")
      .resolves({ name: "test-sha", shaHash: "test-hash", certType: ShaCertificateType.SHA_1 });
    promiseWithSpinnerStub = sandbox.stub(utils, "promiseWithSpinner").callThrough();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    it("should create a SHA certificate", async () => {
      const shaHash = "A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2"; // SHA-1
      const options = {
        user: { email: "test@example.com" },
        tokens: { access_token: "an_access_token" },
      };
      await command.runner()("test-app-id", shaHash, options);

      expect(needProjectIdStub).to.have.been.calledOnce;
      expect(createAppAndroidShaStub).to.have.been.calledOnceWith(
        "test-project-id",
        "test-app-id",
        {
          shaHash: shaHash,
          certType: ShaCertificateType.SHA_1,
        },
      );
      const spinnerText = promiseWithSpinnerStub.getCall(0).args[1];
      expect(spinnerText).to.include("Creating Android SHA certificate");
    });
  });

  describe("getCertHashType", () => {
    it("should return SHA_1 for a 40-character hash", () => {
      const shaHash = "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2";
      expect(getCertHashType(shaHash)).to.equal(ShaCertificateType.SHA_1);
    });

    it("should return SHA_256 for a 64-character hash", () => {
      const shaHash = "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2";
      expect(getCertHashType(shaHash)).to.equal(ShaCertificateType.SHA_256);
    });

    it("should return UNSPECIFIED for other hash lengths", () => {
      const shaHash = "A1B2C3D4E5F6";
      expect(getCertHashType(shaHash)).to.equal(
        ShaCertificateType.SHA_CERTIFICATE_TYPE_UNSPECIFIED,
      );
    });

    it("should handle colons in the hash", () => {
      const shaHash = "A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2:C3:D4:E5:F6:A1:B2";
      expect(getCertHashType(shaHash)).to.equal(ShaCertificateType.SHA_1);
    });
  });
});
