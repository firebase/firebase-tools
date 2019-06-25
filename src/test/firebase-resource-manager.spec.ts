import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../api";
import {
  AndroidAppMetadata,
  AppPlatform,
  createAndroidApp,
  createFirebaseProject,
  createIosApp,
  createWebApp,
  IosAppMetadata,
  ParentResource,
  ParentResourceType,
  ShaCertificate,
  WebAppMetadata,
} from "../firebase-resource-manager";
import * as pollUtils from "../operation-poller";
import { mockAuth } from "./helpers";
import { OraWrapper } from "../oraWrapper";

const PROJECT_ID = "the-best-firebase-project";
const PROJECT_NUMBER = "1234567890";
const PROJECT_NAME = "The Best Project";
const PARENT_RESOURCE: ParentResource = { id: "1111111111111", type: ParentResourceType.FOLDER };
const OPERATION_RESOURCE_NAME_1 = "operations/cp.11111111111111111";
const OPERATION_RESOURCE_NAME_2 = "operations/cp.22222222222222222";
const APP_ID = "appId";
const IOS_APP_BUNDLE_ID = "bundleId";
const IOS_APP_DISPLAY_NAME = "iOS app";
const ANDROID_APP_PACKAGE_NAME = "com.google.packageName";
const ANDROID_APP_DISPLAY_NAME = "Android app";
const WEB_APP_DISPLAY_NAME = "Web app";
const SHA_CERTIFICATE: ShaCertificate = {
  certType: "SHA_1",
  shaHash: "C18FA898916277D97FC5270B1BBF0068F247E1C3",
};

// TODO(caot): Removed when "Deferred Analytics" and "Deferred Location" are launched
const TIME_ZONE = "America/Los_Angeles";
const REGION_CODE = "US";
const LOCATION_ID = "us-central";

describe("FirebaseResourceManager", () => {
  let sandbox: sinon.SinonSandbox;
  let mockOraWrapper: sinon.SinonMock;
  let apiRequestStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let expectedCalledStubs: sinon.SinonStub[];

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    mockOraWrapper = sandbox.mock(OraWrapper.prototype);
    apiRequestStub = sandbox.stub(api, "request");
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation");
    expectedCalledStubs = [];
  });

  afterEach(() => {
    mockOraWrapper.verify();
    expectedCalledStubs.forEach((stub) => expect(stub.calledOnce).to.be.true);
    sandbox.restore();
  });

  describe("createFirebaseProject", () => {
    it("should resolve with project data if it succeeds", async () => {
      expectedCalledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          response: { projectNumber: PROJECT_NUMBER },
        }),
        _addFirebaseApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_2 } }),
        _pollAddFirebaseOperationStub(OPERATION_RESOURCE_NAME_2).resolves({
          response: { projectId: PROJECT_ID, displayName: PROJECT_NAME },
        })
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(2);
      mockOraWrapper.expects("fail").never();

      expect(await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE)).to.deep.equal({
        projectId: PROJECT_ID,
      });
    });

    it("should reject if Cloud project creation fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      expectedCalledStubs.push(_createCloudProjectApiStub().rejects(expectedError));
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(0);
    });

    it("should reject if Cloud project creation polling throws error", async () => {
      const expectedError = new Error("Entity already exists");
      expectedCalledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to create Google Cloud project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    it("should reject if add Firebase api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      expectedCalledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          response: { projectNumber: PROJECT_NUMBER },
        }),
        _addFirebaseApiStub().rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(2);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    it("should reject if polling add Firebase operation returns error response", async () => {
      const expectedError = new Error("Permission denied");
      expectedCalledStubs.push(
        _createCloudProjectApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateCloudProjectOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          response: { projectNumber: PROJECT_NUMBER },
        }),
        _addFirebaseApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_2 } }),
        _pollAddFirebaseOperationStub(OPERATION_RESOURCE_NAME_2).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createFirebaseProject(PROJECT_ID, PROJECT_NAME, PARENT_RESOURCE);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(2);
      expect(pollOperationStub.callCount).to.equal(2);
    });

    function _createCloudProjectApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", "/v1/projects", {
        auth: true,
        origin: api.resourceManagerOrigin,
        timeout: 15000,
        data: { projectId: PROJECT_ID, name: PROJECT_NAME, parent: PARENT_RESOURCE },
      });
    }

    function _addFirebaseApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}:addFirebase`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { timeZone: TIME_ZONE, regionCode: REGION_CODE, locationId: LOCATION_ID },
      });
    }

    function _pollCreateCloudProjectOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Project Creation Poller",
        apiOrigin: api.resourceManagerOrigin,
        apiVersion: "v1",
        operationResourceName,
      });
    }

    function _pollAddFirebaseOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Add Firebase Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });

  describe("createIosApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      expectedCalledStubs.push(
        _createIosAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateIosAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          appId: APP_ID,
          displayName: IOS_APP_DISPLAY_NAME,
          bundleId: IOS_APP_BUNDLE_ID,
        })
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").never();

      const expectedAppMetadata: IosAppMetadata = {
        appId: APP_ID,
        displayName: IOS_APP_DISPLAY_NAME,
        bundleId: IOS_APP_BUNDLE_ID,
        appPlatform: AppPlatform.IOS,
      };
      expect(await createIosApp(PROJECT_ID, IOS_APP_DISPLAY_NAME, IOS_APP_BUNDLE_ID)).to.deep.equal(
        expectedAppMetadata
      );
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      expectedCalledStubs.push(_createIosAppApiStub().rejects(expectedError));
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createIosApp(PROJECT_ID, IOS_APP_DISPLAY_NAME, IOS_APP_BUNDLE_ID);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create iOS app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(0);
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      expectedCalledStubs.push(
        _createIosAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateIosAppOperationStub(OPERATION_RESOURCE_NAME_1).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createIosApp(PROJECT_ID, IOS_APP_DISPLAY_NAME, IOS_APP_BUNDLE_ID);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create iOS app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    function _createIosAppApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}/iosApps`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { displayName: IOS_APP_DISPLAY_NAME, bundleId: IOS_APP_BUNDLE_ID },
      });
    }

    function _pollCreateIosAppOperationStub(operationResourceName: string): sinon.SinonStub {
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
      expectedCalledStubs.push(
        _createAndroidAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateAndroidAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          appId: APP_ID,
          displayName: ANDROID_APP_DISPLAY_NAME,
          packageName: ANDROID_APP_PACKAGE_NAME,
        })
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").never();

      const expectedAppMetadata: AndroidAppMetadata = {
        appId: APP_ID,
        displayName: ANDROID_APP_DISPLAY_NAME,
        packageName: ANDROID_APP_PACKAGE_NAME,
        appPlatform: AppPlatform.ANDROID,
      };
      expect(
        await createAndroidApp(PROJECT_ID, ANDROID_APP_DISPLAY_NAME, ANDROID_APP_PACKAGE_NAME)
      ).to.deep.equal(expectedAppMetadata);
    });

    it("should resolve with app data with sha certificate", async () => {
      expectedCalledStubs.push(
        _createAndroidAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateAndroidAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          appId: APP_ID,
          displayName: ANDROID_APP_DISPLAY_NAME,
          packageName: ANDROID_APP_PACKAGE_NAME,
        }),
        _createShaCertificateApiStub().resolves(SHA_CERTIFICATE)
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(2);
      mockOraWrapper.expects("fail").never();

      const expectedAppMetadata: AndroidAppMetadata = {
        appId: APP_ID,
        displayName: ANDROID_APP_DISPLAY_NAME,
        packageName: ANDROID_APP_PACKAGE_NAME,
        shaCertificates: [SHA_CERTIFICATE],
        appPlatform: AppPlatform.ANDROID,
      };
      expect(
        await createAndroidApp(
          PROJECT_ID,
          ANDROID_APP_DISPLAY_NAME,
          ANDROID_APP_PACKAGE_NAME,
          SHA_CERTIFICATE
        )
      ).to.deep.equal(expectedAppMetadata);
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      expectedCalledStubs.push(_createAndroidAppApiStub().rejects(expectedError));
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createAndroidApp(PROJECT_ID, ANDROID_APP_DISPLAY_NAME, ANDROID_APP_PACKAGE_NAME);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Android app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(0);
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      expectedCalledStubs.push(
        _createAndroidAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateAndroidAppOperationStub(OPERATION_RESOURCE_NAME_1).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createAndroidApp(PROJECT_ID, ANDROID_APP_DISPLAY_NAME, ANDROID_APP_PACKAGE_NAME);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Android app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    it("should reject if creating sha certificate throws error", async () => {
      const expectedError = new Error("Permission denied");
      expectedCalledStubs.push(
        _createAndroidAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateAndroidAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          appId: APP_ID,
          displayName: ANDROID_APP_DISPLAY_NAME,
          packageName: ANDROID_APP_PACKAGE_NAME,
        }),
        _createShaCertificateApiStub().rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(2);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createAndroidApp(
          PROJECT_ID,
          ANDROID_APP_DISPLAY_NAME,
          ANDROID_APP_PACKAGE_NAME,
          SHA_CERTIFICATE
        );
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to add sha certificate for your Android app. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(2);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    function _createAndroidAppApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}/androidApps`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { displayName: ANDROID_APP_DISPLAY_NAME, packageName: ANDROID_APP_PACKAGE_NAME },
      });
    }

    function _pollCreateAndroidAppOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Create Android app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }

    function _createShaCertificateApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/-/androidApps/${APP_ID}/sha`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: SHA_CERTIFICATE,
      });
    }
  });

  describe("createWebApp", () => {
    it("should resolve with app data if it succeeds", async () => {
      expectedCalledStubs.push(
        _createWebAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateWebAppOperationStub(OPERATION_RESOURCE_NAME_1).resolves({
          appId: APP_ID,
          displayName: WEB_APP_DISPLAY_NAME,
        })
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").exactly(1);
      mockOraWrapper.expects("fail").never();

      const expectedAppMetadata: WebAppMetadata = {
        appId: APP_ID,
        displayName: WEB_APP_DISPLAY_NAME,
        appPlatform: AppPlatform.WEB,
      };
      expect(await createWebApp(PROJECT_ID, WEB_APP_DISPLAY_NAME)).to.deep.equal(
        expectedAppMetadata
      );
    });

    it("should reject if app creation api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      expectedCalledStubs.push(_createWebAppApiStub().rejects(expectedError));
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createWebApp(PROJECT_ID, WEB_APP_DISPLAY_NAME);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Web app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(0);
    });

    it("should reject if polling throws error", async () => {
      const expectedError = new Error("Permission denied");
      expectedCalledStubs.push(
        _createWebAppApiStub().resolves({ body: { name: OPERATION_RESOURCE_NAME_1 } }),
        _pollCreateWebAppOperationStub(OPERATION_RESOURCE_NAME_1).rejects(expectedError)
      );
      mockOraWrapper.expects("start").exactly(1);
      mockOraWrapper.expects("succeed").never();
      mockOraWrapper.expects("fail").exactly(1);

      let err;
      try {
        await createWebApp(PROJECT_ID, WEB_APP_DISPLAY_NAME);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        `Failed to create Web app for project ${PROJECT_ID}. See firebase-debug.log for more info.`
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.callCount).to.equal(1);
      expect(pollOperationStub.callCount).to.equal(1);
    });

    function _createWebAppApiStub(): sinon.SinonStub {
      return apiRequestStub.withArgs("POST", `/v1beta1/projects/${PROJECT_ID}/webApps`, {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: 15000,
        data: { displayName: WEB_APP_DISPLAY_NAME },
      });
    }

    function _pollCreateWebAppOperationStub(operationResourceName: string): sinon.SinonStub {
      return pollOperationStub.withArgs({
        pollerName: "Create Web app Poller",
        apiOrigin: api.firebaseApiOrigin,
        apiVersion: "v1beta1",
        operationResourceName,
      });
    }
  });
});
