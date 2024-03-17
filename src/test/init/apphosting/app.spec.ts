import * as webApps from "../../../init/features/apphosting/app";
import * as apps from "../../../../src/management/apps";
import * as sinon from "sinon";
import { expect } from "chai";
import { FirebaseError } from "../../../error";

describe("app", () => {
  const projectId = "projectId";
  const backendId = "backendId";

  describe("getOrCreateWebApp", () => {
    let createWebApp: sinon.SinonStub;
    let listFirebaseApps: sinon.SinonStub;
    let promptFirebaseWebApp: sinon.SinonStub;

    beforeEach(() => {
      createWebApp = sinon.stub(apps, "createWebApp");
      listFirebaseApps = sinon.stub(apps, "listFirebaseApps");
      promptFirebaseWebApp = sinon.stub(webApps, "promptFirebaseWebApp");
    });

    afterEach(() => {
      createWebApp.restore();
      listFirebaseApps.restore();
      promptFirebaseWebApp.restore();
    });

    it("should create an app with backendId if no apps exist yet", async () => {
      listFirebaseApps.returns(Promise.resolve([]));
      createWebApp.returns({ displayName: backendId, appId: "appId" });

      await webApps.getOrCreateWebApp(projectId, null, backendId);
      expect(createWebApp).calledWith(projectId, { displayName: backendId });
    });

    it("throws error if given webApp doesn't exist in project", async () => {
      listFirebaseApps.returns(
        Promise.resolve([{ displayName: "testWebApp", appId: "testWebAppId" }]),
      );

      await expect(
        webApps.getOrCreateWebApp(projectId, "nonExistentWebApp", backendId),
      ).to.be.rejectedWith(
        FirebaseError,
        "The web app 'nonExistentWebApp' does not exist in project projectId",
      );
    });

    it("prompts user for a web app if none is provided", async () => {
      listFirebaseApps.returns(
        Promise.resolve([{ displayName: "testWebApp1", appId: "testWebAppId1" }]),
      );

      const userSelection = { name: "testWebApp2", id: "testWebAppId2" };
      promptFirebaseWebApp.returns(Promise.resolve(userSelection));

      await expect(webApps.getOrCreateWebApp(projectId, null, backendId)).to.eventually.deep.equal(
        userSelection,
      );
      expect(promptFirebaseWebApp).to.be.called;
    });
  });
});
