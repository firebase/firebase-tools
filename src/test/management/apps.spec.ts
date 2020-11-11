import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import * as api from "../../api";
import {
  AndroidAppMetadata,
  AppPlatform,
  createAndroidApp,
  createIosApp,
  createWebApp,
  getAppConfig,
  getAppConfigFile,
  getAppPlatform,
  IosAppMetadata,
  listFirebaseApps,
  WebAppMetadata,
} from "../../management/apps";
import * as pollUtils from "../../operation-poller";
import { FirebaseError } from "../../error";

const PROJECT_ID = "the-best-firebase-project";
const OPERATION_RESOURCE_NAME_1 = "operations/cp.11111111111111111";
const APP_ID = "appId";
const IOS_APP_BUNDLE_ID = "bundleId";
const IOS_APP_STORE_ID = "appStoreId";
const IOS_APP_DISPLAY_NAME = "iOS app";
const ANDROID_APP_PACKAGE_NAME = "com.google.packageName";
const ANDROID_APP_DISPLAY_NAME = "Android app";
const WEB_APP_DISPLAY_NAME = "Web app";

function generateIosAppList(counts: number): IosAppMetadata[] {
  return Array.from(Array(counts), (_, i: number) => ({
    name: `projects/project-id-${i}/apps/app-id-${i}`,
    projectId: `project-id`,
    appId: `app-id-${i}`,
    platform: AppPlatform.IOS,
    displayName: `Project ${i}`,
    bundleId: `bundle-id-${i}`,
  }));
}

function generateAndroidAppList(counts: number): AndroidAppMetadata[] {
  return Array.from(Array(counts), (_, i: number) => ({
    name: `projects/project-id-${i}/apps/app-id-${i}`,
    projectId: `project-id`,
    appId: `app-id-${i}`,
    platform: AppPlatform.ANDROID,
    displayName: `Project ${i}`,
    packageName: `package.name.app${i}`,
  }));
}

function generateWebAppList(counts: number): WebAppMetadata[] {
  return Array.from(Array(counts), (_, i: number) => ({
    name: `projects/project-id-${i}/apps/app-id-${i}`,
    projectId: `project-id`,
    appId: `app-id-${i}`,
    platform: AppPlatform.WEB,
    displayName: `Project ${i}`,
  }));
}

describe("App management", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    apiRequestStub = sandbox.stub(api, "request").throws("Unexpected API request call");
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation").throws("Unexpected poll call");
    readFileSyncStub = sandbox.stub(fs, "readFileSync").throws("Unxpected readFileSync call");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getAppPlatform", () => {
    it("should return the iOS platform", () => {
      expect(getAppPlatform("IOS")).to.equal(AppPlatform.IOS);
      expect(getAppPlatform("iOS")).to.equal(AppPlatform.IOS);
      expect(getAppPlatform("Ios")).to.equal(AppPlatform.IOS);
    });

    it("should return the Android platform", () => {
      expect(getAppPlatform("Android")).to.equal(AppPlatform.ANDROID);
      expect(getAppPlatform("ANDROID")).to.equal(AppPlatform.ANDROID);
      expect(getAppPlatform("aNDroiD")).to.equal(AppPlatform.ANDROID);
    });

    it("should return the Web platform", () => {
      expect(getAppPlatform("Web")).to.equal(AppPlatform.WEB);
      expect(getAppPlatform("WEB")).to.equal(AppPlatform.WEB);
      expect(getAppPlatform("wEb")).to.equal(AppPlatform.WEB);
    });

    it("should return the ANY platform", () => {
      expect(getAppPlatform("")).to.equal(AppPlatform.ANY);
    });

    it("should throw if the platform is unknown", () => {
      expect(() => getAppPlatform("unknown")).to.throw(
        FirebaseError,
        "Unexpected platform. Only iOS, Android, and Web apps are supported"
      );
    });
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

  describe("listFirebaseApps", () => {
    it("should resolve with app list if it succeeds with only 1 api call", async () => {
      const appCountsPerPlatform = 3;
      const expectedAppList = [
        ...generateIosAppList(appCountsPerPlatform),
        ...generateAndroidAppList(appCountsPerPlatform),
        ...generateWebAppList(appCountsPerPlatform),
      ];
      apiRequestStub.onFirstCall().resolves({ body: { apps: expectedAppList } });

      const apps = await listFirebaseApps(PROJECT_ID, AppPlatform.ANY);

      expect(apps).to.deep.equal(expectedAppList);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}:searchApps?pageSize=100`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        }
      );
    });

    it("should resolve with iOS app list", async () => {
      const appCounts = 10;
      const expectedAppList = generateIosAppList(appCounts);
      const apiResponseAppList = expectedAppList.map((app) => {
        const iosApp = { ...app };
        delete iosApp.platform;
        return iosApp;
      });
      apiRequestStub.onFirstCall().resolves({ body: { apps: apiResponseAppList } });

      const apps = await listFirebaseApps(PROJECT_ID, AppPlatform.IOS);

      expect(apps).to.deep.equal(expectedAppList);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}/iosApps?pageSize=100`
      );
    });

    it("should resolve with Android app list", async () => {
      const appCounts = 10;
      const expectedAppList = generateAndroidAppList(appCounts);
      const apiResponseAppList = expectedAppList.map((app) => {
        const androidApps = { ...app };
        delete androidApps.platform;
        return androidApps;
      });
      apiRequestStub.onFirstCall().resolves({ body: { apps: apiResponseAppList } });

      const apps = await listFirebaseApps(PROJECT_ID, AppPlatform.ANDROID);

      expect(apps).to.deep.equal(expectedAppList);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}/androidApps?pageSize=100`
      );
    });

    it("should resolve with Web app list", async () => {
      const appCounts = 10;
      const expectedAppList = generateWebAppList(appCounts);
      const apiResponseAppList = expectedAppList.map((app) => {
        const webApp = { ...app };
        delete webApp.platform;
        return webApp;
      });
      apiRequestStub.onFirstCall().resolves({ body: { apps: apiResponseAppList } });

      const apps = await listFirebaseApps(PROJECT_ID, AppPlatform.WEB);

      expect(apps).to.deep.equal(expectedAppList);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}/webApps?pageSize=100`
      );
    });

    it("should concatenate pages to get app list if it succeeds", async () => {
      const appCountsPerPlatform = 3;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedAppList = [
        ...generateIosAppList(appCountsPerPlatform),
        ...generateAndroidAppList(appCountsPerPlatform),
        ...generateWebAppList(appCountsPerPlatform),
      ];
      apiRequestStub
        .onFirstCall()
        .resolves({ body: { apps: expectedAppList.slice(0, pageSize), nextPageToken } })
        .onSecondCall()
        .resolves({ body: { apps: expectedAppList.slice(pageSize, appCountsPerPlatform * 3) } });

      const apps = await listFirebaseApps(PROJECT_ID, AppPlatform.ANY, pageSize);

      expect(apps).to.deep.equal(expectedAppList);
      expect(apiRequestStub.firstCall).to.be.calledWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}:searchApps?pageSize=${pageSize}`
      );
      expect(apiRequestStub.secondCall).to.be.calledWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}:searchApps?pageSize=${pageSize}&pageToken=${nextPageToken}`
      );
    });

    it("should reject if the first api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, AppPlatform.ANY);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}:searchApps?pageSize=100`
      );
    });

    it("should rejects if error is thrown in subsequence api call", async () => {
      const appCounts = 10;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedAppList = generateAndroidAppList(appCounts);
      const expectedError = new Error("HTTP Error 400: unexpected error");
      apiRequestStub
        .onFirstCall()
        .resolves({ body: { apps: expectedAppList.slice(0, pageSize), nextPageToken } })
        .onSecondCall()
        .rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, AppPlatform.ANY, pageSize);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub.firstCall).to.be.calledWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}:searchApps?pageSize=${pageSize}`
      );
      expect(apiRequestStub.secondCall).to.be.calledWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}:searchApps?pageSize=${pageSize}&pageToken=${nextPageToken}`
      );
    });

    it("should reject if the list iOS apps fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, AppPlatform.IOS);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase IOS apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}/iosApps?pageSize=100`
      );
    });

    it("should reject if the list Android apps fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, AppPlatform.ANDROID);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase ANDROID apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}/androidApps?pageSize=100`
      );
    });

    it("should reject if the list Web apps fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, AppPlatform.WEB);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to list Firebase WEB apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/${PROJECT_ID}/webApps?pageSize=100`
      );
    });
  });

  describe("getAppConfigFile", () => {
    it("should resolve with iOS app configuration if it succeeds", async () => {
      const expectedConfigFileContent = "test iOS configuration";
      const mockBase64Content = Buffer.from(expectedConfigFileContent).toString("base64");
      apiRequestStub.onFirstCall().resolves({
        body: { configFilename: "GoogleService-Info.plist", configFileContents: mockBase64Content },
      });

      const configData = await getAppConfig(APP_ID, AppPlatform.IOS);
      const fileData = getAppConfigFile(configData, AppPlatform.IOS);

      expect(fileData).to.deep.equal({
        fileName: "GoogleService-Info.plist",
        fileContents: expectedConfigFileContent,
      });
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/-/iosApps/${APP_ID}/config`
      );
    });

    it("should resolve with Web app configuration if it succeeds", async () => {
      const mockWebConfig = {
        projectId: PROJECT_ID,
        appId: APP_ID,
        apiKey: "api-key",
      };
      apiRequestStub.onFirstCall().resolves({ body: mockWebConfig });
      readFileSyncStub.onFirstCall().returns("{/*--CONFIG--*/}");

      const configData = await getAppConfig(APP_ID, AppPlatform.WEB);
      const fileData = getAppConfigFile(configData, AppPlatform.WEB);

      expect(fileData).to.deep.equal({
        fileName: "google-config.js",
        fileContents: JSON.stringify(mockWebConfig, null, 2),
      });
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/-/webApps/${APP_ID}/config`
      );
      expect(readFileSyncStub).to.be.calledOnce;
    });
  });

  describe("getAppConfig", () => {
    it("should resolve with iOS app configuration if it succeeds", async () => {
      const mockBase64Content = Buffer.from("test iOS configuration").toString("base64");
      apiRequestStub.onFirstCall().resolves({
        body: { configFilename: "GoogleService-Info.plist", configFileContents: mockBase64Content },
      });

      const configData = await getAppConfig(APP_ID, AppPlatform.IOS);

      expect(configData).to.deep.equal({
        configFilename: "GoogleService-Info.plist",
        configFileContents: mockBase64Content,
      });
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/-/iosApps/${APP_ID}/config`
      );
    });

    it("should resolve with Android app configuration if it succeeds", async () => {
      const mockBase64Content = Buffer.from("test Android configuration").toString("base64");
      apiRequestStub.onFirstCall().resolves({
        body: { configFilename: "google-services.json", configFileContents: mockBase64Content },
      });

      const configData = await getAppConfig(APP_ID, AppPlatform.ANDROID);

      expect(configData).to.deep.equal({
        configFilename: "google-services.json",
        configFileContents: mockBase64Content,
      });
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/-/androidApps/${APP_ID}/config`
      );
    });

    it("should resolve with Web app configuration if it succeeds", async () => {
      const mockWebConfig = {
        projectId: PROJECT_ID,
        appId: APP_ID,
        apiKey: "api-key",
      };
      apiRequestStub.onFirstCall().resolves({ body: mockWebConfig });

      const configData = await getAppConfig(APP_ID, AppPlatform.WEB);

      expect(configData).to.deep.equal(mockWebConfig);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/-/webApps/${APP_ID}/config`
      );
    });

    it("should reject if api request fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      apiRequestStub.onFirstCall().rejects(expectedError);

      let err;
      try {
        await getAppConfig(APP_ID, AppPlatform.ANDROID);
      } catch (e) {
        err = e;
      }

      expect(err.message).to.equal(
        "Failed to get ANDROID app configuration. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(apiRequestStub).to.be.calledOnceWith(
        "GET",
        `/v1beta1/projects/-/androidApps/${APP_ID}/config`
      );
    });
  });
});
