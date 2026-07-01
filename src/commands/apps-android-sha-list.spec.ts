import { expect } from "chai";
import * as sinon from "sinon";
import * as Table from "cli-table3";
import { Command } from "../command";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import { AppAndroidShaData, ShaCertificateType } from "../management/apps";
import { command, logCertificatesList, logCertificatesCount } from "./apps-android-sha-list";
import * as auth from "../requireAuth";
import { logger } from "../logger";

describe("apps:android:sha:list", () => {
  let sandbox: sinon.SinonSandbox;
  let listAppAndroidShaStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(auth, "requireAuth").resolves();
    sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    listAppAndroidShaStub = sandbox.stub(apps, "listAppAndroidSha");
    loggerInfoStub = sandbox.stub(logger, "info");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    const options = {
      user: { email: "test@example.com" },
      tokens: { access_token: "an_access_token" },
    };

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
      listAppAndroidShaStub.resolves(certificates);

      await command.runner()("test-app-id", options);

      expect(listAppAndroidShaStub).to.have.been.calledOnceWith("test-project-id", "test-app-id");
      expect(loggerInfoStub).to.have.been.calledWith(sinon.match("s1"));
      expect(loggerInfoStub).to.have.been.calledWith(sinon.match("s2"));
    });

    it('should display "No SHA certificate hashes found." if no certificates exist', async () => {
      listAppAndroidShaStub.resolves([]);

      await command.runner()("test-app-id", options);

      expect(listAppAndroidShaStub).to.have.been.calledOnceWith("test-project-id", "test-app-id");
      expect(loggerInfoStub).to.have.been.calledWith("No SHA certificate hashes found.");
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

    it('should print "No SHA certificate hashes found." if no certificates exist', () => {
      logCertificatesList([]);
      expect(loggerInfoStub).to.have.been.calledWith("No SHA certificate hashes found.");
    });
  });

  describe("logCertificatesCount", () => {
    it("should print the total number of certificates", () => {
      logCertificatesCount(5);
      expect(loggerInfoStub).to.have.been.calledWith("");
      expect(loggerInfoStub).to.have.been.calledWith("5 SHA hash(es) total.");
    });

    it("should not print if count is 0", () => {
      logCertificatesCount(0);
      expect(loggerInfoStub).to.not.have.been.called;
    });
  });
});
