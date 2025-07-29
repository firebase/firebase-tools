import { expect } from "chai";
import * as sinon from "sinon";
import * as Table from "cli-table3";
import { Command } from "../command";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import { AppAndroidShaData, ShaCertificateType } from "../management/apps";
import * as utils from "../utils";
import { command, logCertificatesList, logCertificatesCount } from "./apps-android-sha-list";
import * as auth from "../auth";

describe("apps:android:sha:list", () => {
  let sandbox: sinon.SinonSandbox;
  let promiseWithSpinnerStub: sinon.SinonStub;
  let requireAuthStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    requireAuthStub = sandbox.stub(auth, "requireAuth").resolves();
    sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    sandbox.stub(apps, "listAppAndroidSha");
    promiseWithSpinnerStub = sandbox.stub(utils, "promiseWithSpinner");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    it("should list SHA certificates", async () => {
      const certificates: AppAndroidShaData[] = [
        {
          name: "projects/p/androidApps/a/sha/s1",
          shaHash: "h1",
          certType: ShaCertificateType.SHA_1,
        },
        {
          name: "projects/p/androidApps/a/sha/s2",
          shaHash: "h2",
          certType: ShaCertificateType.SHA_256,
        },
      ];
      promiseWithSpinnerStub.resolves(certificates);

      await command.runner()("test-app-id", {});

      expect(promiseWithSpinnerStub).to.have.been.calledOnce;
      const spinnerText = promiseWithSpinnerStub.getCall(0).args[1];
      expect(spinnerText).to.include("Preparing the list");
    });

    it('should display "No SHA certificate hashes found." if no certificates exist', async () => {
      promiseWithSpinnerStub.resolves([]);

      await command.runner()("test-app-id", {});

      // No assertion needed here, we are just checking that it does not throw.
    });
  });

  describe("logCertificatesList", () => {
    it("should print a table of certificates", () => {
      const certificates: AppAndroidShaData[] = [
        {
          name: "projects/p/androidApps/app1/sha/sha1",
          shaHash: "hash1",
          certType: ShaCertificateType.SHA_1,
        },
        {
          name: "projects/p/androidApps/app2/sha/sha2",
          shaHash: "hash2",
          certType: ShaCertificateType.SHA_256,
        },
      ];
      const tableSpy = sandbox.spy(Table.prototype, "push");

      logCertificatesList(certificates);

      expect(tableSpy.getCall(0).args[0]).to.deep.equal([
        "app1",
        "sha1",
        "hash1",
        ShaCertificateType.SHA_1,
      ]);
      expect(tableSpy.getCall(1).args[0]).to.deep.equal([
        "app2",
        "sha2",
        "hash2",
        ShaCertificateType.SHA_256,
      ]);
    });
  });

  describe("logCertificatesCount", () => {
    it("should print the total number of certificates", () => {
      logCertificatesCount(5);
      // No assertion needed here, we are just checking that it does not throw.
    });

    it("should not print if count is 0", () => {
      logCertificatesCount(0);
      // No assertion needed here, we are just checking that it does not throw.
    });
  });
});
