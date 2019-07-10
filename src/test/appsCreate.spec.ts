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
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation").throws("Unexpected poll call");
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
      apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
      pollOperationStub.onFirstCall().resolves(expectedAppMetadata);

      const resultAppInfo = await createIosApp(PROJECT_ID, {
        displayName: IOS_APP_DISPLAY_NAME,
        bundleId: IOS_APP_BUNDLE_ID,
        appStoreId: IOS_APP_STORE_ID,
      });

      expect(resultAppInfo).to.deep.equal(expectedAppMetadata);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/iosApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: IOS_APP_DISPLAY_NAME,
            bundleId: IOS_APP_BUNDLE_ID,
            appStoreId: IOS_APP_STORE_ID,
          },
        }
      );
      expect(pollOperationStub).to.be.calledOnceWith({
        pollerName: "Create iOS app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName: OPERATION_RESOURCE_NAME_1,
      });
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

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
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/iosApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: IOS_APP_DISPLAY_NAME,
            bundleId: IOS_APP_BUNDLE_ID,
            appStoreId: IOS_APP_STORE_ID,
          },
        }
      );
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
      pollOperationStub.onFirstCall().rejects(expectedError);

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
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/iosApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: IOS_APP_DISPLAY_NAME,
            bundleId: IOS_APP_BUNDLE_ID,
            appStoreId: IOS_APP_STORE_ID,
          },
        }
      );
      expect(pollOperationStub).to.be.calledOnceWith({
        pollerName: "Create iOS app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName: OPERATION_RESOURCE_NAME_1,
      });
    });
  });

  describe("createAndroidApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      const expectedAppMetadata = {
        appId: APP_ID,
        displayName: ANDROID_APP_DISPLAY_NAME,
        packageName: ANDROID_APP_PACKAGE_NAME,
      };
      apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
      pollOperationStub.onFirstCall().resolves(expectedAppMetadata);

      const resultAppInfo = await createAndroidApp(PROJECT_ID, {
        displayName: ANDROID_APP_DISPLAY_NAME,
        packageName: ANDROID_APP_PACKAGE_NAME,
      });

      expect(resultAppInfo).to.equal(expectedAppMetadata);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/androidApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: ANDROID_APP_DISPLAY_NAME,
            packageName: ANDROID_APP_PACKAGE_NAME,
          },
        }
      );
      expect(pollOperationStub).to.be.calledOnceWith({
        pollerName: "Create Android app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName: OPERATION_RESOURCE_NAME_1,
      });
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

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
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/androidApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: ANDROID_APP_DISPLAY_NAME,
            packageName: ANDROID_APP_PACKAGE_NAME,
          },
        }
      );
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
      pollOperationStub.onFirstCall().rejects(expectedError);

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
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/androidApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: ANDROID_APP_DISPLAY_NAME,
            packageName: ANDROID_APP_PACKAGE_NAME,
          },
        }
      );
      expect(pollOperationStub).to.be.calledOnceWith({
        pollerName: "Create Android app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName: OPERATION_RESOURCE_NAME_1,
      });
    });
  });

  describe("createWebApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      const expectedAppMetadata = {
        appId: APP_ID,
        displayName: WEB_APP_DISPLAY_NAME,
      };
      apiRequestStub.onFirstCall().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } });
      pollOperationStub.onFirstCall().resolves(expectedAppMetadata);

      const resultAppInfo = await createWebApp(PROJECT_ID, { displayName: WEB_APP_DISPLAY_NAME });

      expect(resultAppInfo).to.equal(expectedAppMetadata);
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/webApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: WEB_APP_DISPLAY_NAME,
          },
        }
      );
      expect(pollOperationStub).to.be.calledOnceWith({
        pollerName: "Create Web app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName: OPERATION_RESOURCE_NAME_1,
      });
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

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
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/webApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: WEB_APP_DISPLAY_NAME,
          },
        }
      );
      expect(pollOperationStub).to.be.not.called;
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      apiRequestStub.onFirstCall().resolves({
        body: { name: OPERATION_RESOURCE_NAME_1 },
      });
      pollOperationStub.onFirstCall().rejects(expectedError);

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
      expect(apiRequestStub).to.be.calledOnceWith(
        "POST",
        `/v1beta1/projects/${PROJECT_ID}/webApps`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 15000,
          data: {
            displayName: WEB_APP_DISPLAY_NAME,
          },
        }
      );
      expect(pollOperationStub).to.be.calledOnceWith({
        pollerName: "Create Web app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName: OPERATION_RESOURCE_NAME_1,
      });
    });
  });
});
