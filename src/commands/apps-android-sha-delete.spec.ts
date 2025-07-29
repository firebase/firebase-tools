import { expect } from "chai";
import * as sinon from "sinon";
import { Command } from "../command";
import * as projectUtils from "../projectUtils";
import * as apps from "../management/apps";
import * as utils from "../utils";
import { command } from "./apps-android-sha-delete";

describe("apps:android:sha:delete", () => {
  let sandbox: sinon.SinonSandbox;
  let needProjectIdStub: sinon.SinonStub;
  let deleteAppAndroidShaStub: sinon.SinonStub;
  let promiseWithSpinnerStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    needProjectIdStub = sandbox.stub(projectUtils, "needProjectId").returns("test-project-id");
    deleteAppAndroidShaStub = sandbox.stub(apps, "deleteAppAndroidSha").resolves();
    promiseWithSpinnerStub = sandbox.stub(utils, "promiseWithSpinner").callThrough();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should be a Command", () => {
    expect(command).to.be.an.instanceOf(Command);
  });

  describe("action", () => {
    it("should delete a SHA certificate", async () => {
      await command.runner()("test-app-id", "test-sha-id", {});

      expect(needProjectIdStub).to.have.been.calledOnce;
      expect(deleteAppAndroidShaStub).to.have.been.calledOnce;
      const spinnerText = promiseWithSpinnerStub.getCall(0).args[1];
      expect(spinnerText).to.include("Deleting Android SHA certificate hash");
    });
  });
});
