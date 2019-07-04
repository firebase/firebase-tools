import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import { createAndroidApp, createIosApp, createWebApp } from "../appsCreate";
import * as pollUtils from "../operation-poller";
import { mockAuth } from "./helpers";

const PROJECT_ID = "the-best-firebase-project";
const OPERATION_RESOURCE_NAME_1 = "operations/cp.11111111111111111";
const APP_ID = "appId";
const IOS_APP_BUNDLE_ID = "bundleId";
const IOS_APP_STORE_ID = "appStoreId";
const IOS_APP_DISPLAY_NAME = "iOS app";
const ANDROID_APP_PACKAGE_NAME = "com.google.packageName";
const ANDROID_APP_DISPLAY_NAME = "Android app";
const WEB_APP_DISPLAY_NAME = "Web app";

describe("appsCreate", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request");
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("createIosApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      const expectedAppMetadata = {
        appId: APP_ID,
        displayName: IOS_APP_DISPLAY_NAME,
        bundleId: IOS_APP_BUNDLE_ID,
        appStoreId: IOS_APP_STORE_ID,
      };
      const createIosAppStub = createIosAppApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateIosAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves(
        expectedAppMetadata
      );

      expect(
        await createIosApp(PROJECT_ID, {
          displayName: IOS_APP_DISPLAY_NAME,
          bundleId: IOS_APP_BUNDLE_ID,
          appStoreId: IOS_APP_STORE_ID,
        })
      ).to.deep.equal(expectedAppMetadata);
      expect(createIosAppStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const createIosAppStub = createIosAppApiStub().rejects(expectedError);

      let err;
      try {
        await createIosApp(PROJECT_ID, {
          displayName: IOS_APP_DISPLAY_NAME,
          bundleId: IOS_APP_BUNDLE_ID,
          appStoreId: IOS_APP_STORE_ID,
        });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create iOS app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(createIosAppStub).to.be.calledOnce;
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      const createIosAppStub = createIosAppApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateIosAppOperationStub(OPERATION_RESOURCE_NAME_1).rejects(
        expectedError
      );

      let err;
      try {
        await createIosApp(PROJECT_ID, {
          displayName: IOS_APP_DISPLAY_NAME,
          bundleId: IOS_APP_BUNDLE_ID,
          appStoreId: IOS_APP_STORE_ID,
        });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create iOS app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(createIosAppStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    function createIosAppApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}/iosApps`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: {
          displayName: IOS_APP_DISPLAY_NAME,
          bundleId: IOS_APP_BUNDLE_ID,
          appStoreId: IOS_APP_STORE_ID,
        },
      });
    }

    function pollCreateIosAppOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Create iOS app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });

  describe("createAndroidApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      const expectedAppMetadata = {
        appId: APP_ID,
        displayName: ANDROID_APP_DISPLAY_NAME,
        packageName: ANDROID_APP_PACKAGE_NAME,
      };
      const createAndroidAppStub = createAndroidAppApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateAndroidAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves(
        expectedAppMetadata
      );

      expect(
        await createAndroidApp(PROJECT_ID, {
          displayName: ANDROID_APP_DISPLAY_NAME,
          packageName: ANDROID_APP_PACKAGE_NAME,
        })
      ).to.equal(expectedAppMetadata);
      expect(createAndroidAppStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const createAndroidAppStub = createAndroidAppApiStub().rejects(expectedError);

      let err;
      try {
        await createAndroidApp(PROJECT_ID, {
          displayName: ANDROID_APP_DISPLAY_NAME,
          packageName: ANDROID_APP_PACKAGE_NAME,
        });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Android app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(createAndroidAppStub).to.be.calledOnce;
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      const createAndroidAppStub = createAndroidAppApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateAndroidAppOperationStub(OPERATION_RESOURCE_NAME_1).rejects(
        expectedError
      );

      let err;
      try {
        await createAndroidApp(PROJECT_ID, {
          displayName: ANDROID_APP_DISPLAY_NAME,
          packageName: ANDROID_APP_PACKAGE_NAME,
        });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Android app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(createAndroidAppStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    function createAndroidAppApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}/androidApps`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { displayName: ANDROID_APP_DISPLAY_NAME, packageName: ANDROID_APP_PACKAGE_NAME },
      });
    }

    function pollCreateAndroidAppOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Create Android app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });

  describe("createWebApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      const expectedAppMetadata = {
        appId: APP_ID,
        displayName: WEB_APP_DISPLAY_NAME,
      };
      const createWebAppStub = createWebAppApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateWebAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves(
        expectedAppMetadata
      );

      expect(await createWebApp(PROJECT_ID, { displayName: WEB_APP_DISPLAY_NAME })).to.equal(
        expectedAppMetadata
      );
      expect(createWebAppStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const createWebAppStub = createWebAppApiStub().rejects(expectedError);

      let err;
      try {
        await createWebApp(PROJECT_ID, { displayName: WEB_APP_DISPLAY_NAME });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Web app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(createWebAppStub).to.be.calledOnce;
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      const createWebAppStub = createWebAppApiStub().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      const pollStub = pollCreateWebAppOperationStub(OPERATION_RESOURCE_NAME_1).rejects(
        expectedError
      );

      let err;
      try {
        await createWebApp(PROJECT_ID, { displayName: WEB_APP_DISPLAY_NAME });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Web app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(createWebAppStub).to.be.calledOnce;
      expect(pollStub).to.be.calledOnce;
    });

    function createWebAppApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}/webApps`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { displayName: WEB_APP_DISPLAY_NAME },
      });
    }

    function pollCreateWebAppOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Create Web app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });
});
