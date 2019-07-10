import { expect } from "chai";
import * as sinon from "sinon";

import * as api from "../../api";
import { listFirebaseApps, listFirebaseProjects } from "../../management/list";
import {
  AndroidAppMetadata,
  AppPlatform,
  FirebaseProjectMetadata,
  IosAppMetadata,
  WebAppMetadata,
} from "../../management/metadata";
import { mockAuth } from "../helpers";

const PROJECT_ID = "project-id";

function generateProjectList(counts: number): FirebaseProjectMetadata[] {
  return Array.from(Array(counts), (_, i: number) => ({
    name: `projects/project-id-${i}`,
    projectId: `project-id-${i}`,
    displayName: `Project ${i}`,
    projectNumber: `${i}`,
    resources: {
      hostingSite: `site-${i}`,
      realtimeDatabaseInstance: `instance-${i}`,
      storageBucket: `bucket-${i}`,
      locationId: `location-${i}`,
    },
  }));
}

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

describe("list", () => {
  let sandbox: sinon.SinonSandbox;
  let apiRequestStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockAuth(sandbox);
    apiRequestStub = sandbox.stub(api, "request");
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("listFirebaseProjects", () => {
    it("should resolve with project list if it succeeds with only 1 api call", async () => {
      const projectCounts = 10;
      const expectedProjectList = generateProjectList(projectCounts);
      const listProjectsStub = listProjectsApiStub().resolves({
        body: { results: expectedProjectList },
      });

      expect(await listFirebaseProjects()).to.deep.equal(expectedProjectList);
      expect(listProjectsStub).to.be.calledOnce;
    });

    it("should concatenate pages to get project list if it succeeds with multiple api calls", async () => {
      const projectCounts = 10;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedProjectList = generateProjectList(projectCounts);
      const firstCallStub = listProjectsApiStub(pageSize).resolves({
        body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
      });
      const secondCallStub = listProjectsApiStub(pageSize, nextPageToken).resolves({
        body: { results: expectedProjectList.slice(pageSize, projectCounts) },
      });

      expect(await listFirebaseProjects(pageSize)).to.deep.equal(expectedProjectList);
      expect(firstCallStub).to.be.calledOnce;
      expect(secondCallStub).to.be.calledOnce;
    });

    it("should reject if the first api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const listProjectsStub = listProjectsApiStub().rejects(expectedError);

      let err;
      try {
        await listFirebaseProjects();
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase projects. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(listProjectsStub).to.be.calledOnce;
    });

    it("should rejects if error is thrown in subsequence api call", async () => {
      const projectCounts = 10;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedProjectList = generateProjectList(projectCounts);
      const expectedError = new Error("HTTP Error 400: unexpected error");
      const firstCallStub = listProjectsApiStub(pageSize).resolves({
        body: { results: expectedProjectList.slice(0, pageSize), nextPageToken },
      });
      const secondCallStub = listProjectsApiStub(pageSize, nextPageToken).rejects(expectedError);

      let err;
      try {
        await listFirebaseProjects(pageSize);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase projects. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(firstCallStub).to.be.calledOnce;
      expect(secondCallStub).to.be.calledOnce;
    });

    function listProjectsApiStub(pageSize: number = 1000, nextPageToken?: string): sinon.SinonStub {
      const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
      return apiRequestStub.withArgs(
        "GET",
        `/v1beta1/projects?pageSize=${pageSize}${pageTokenQueryString}`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        }
      );
    }
  });

  describe("listFirebaseApps", () => {
    it("should resolve with app list if it succeeds with only 1 api call", async () => {
      const appCountsPerPlatform = 3;
      const expectedAppList = [
        ...generateIosAppList(appCountsPerPlatform),
        ...generateAndroidAppList(appCountsPerPlatform),
        ...generateWebAppList(appCountsPerPlatform),
      ];
      const listAppsStub = listAppsApiRequestStub().resolves({
        body: { apps: expectedAppList },
      });

      expect(await listFirebaseApps(PROJECT_ID)).to.deep.equal(expectedAppList);
      expect(listAppsStub).to.be.calledOnce;
    });

    it("should resolve with iOS app list", async () => {
      const appCounts = 10;
      const expectedAppList = generateIosAppList(appCounts);
      const apiResponseAppList: any[] = expectedAppList.map((app) => {
        const iosApp: any = { ...app };
        delete iosApp.platform;
        return iosApp;
      });
      const listAppsStub = listAppsApiRequestStub(AppPlatform.IOS).resolves({
        body: { apps: apiResponseAppList },
      });

      expect(await listFirebaseApps(PROJECT_ID, { platform: AppPlatform.IOS })).to.deep.equal(
        expectedAppList
      );
      expect(listAppsStub).to.be.calledOnce;
    });

    it("should resolve with Android app list", async () => {
      const appCounts = 10;
      const expectedAppList = generateAndroidAppList(appCounts);
      const apiResponseAppList: any[] = expectedAppList.map((app) => {
        const androidApps: any = { ...app };
        delete androidApps.platform;
        return androidApps;
      });
      const listAppsStub = listAppsApiRequestStub(AppPlatform.ANDROID).resolves({
        body: { apps: apiResponseAppList },
      });

      expect(await listFirebaseApps(PROJECT_ID, { platform: AppPlatform.ANDROID })).to.deep.equal(
        expectedAppList
      );
      expect(listAppsStub).to.be.calledOnce;
    });

    it("should resolve with Web app list", async () => {
      const appCounts = 10;
      const expectedAppList = generateWebAppList(appCounts);
      const apiResponseAppList: any[] = expectedAppList.map((app) => {
        const webApp: any = { ...app };
        delete webApp.platform;
        return webApp;
      });
      const listAppsStub = listAppsApiRequestStub(AppPlatform.WEB).resolves({
        body: { apps: apiResponseAppList },
      });

      expect(await listFirebaseApps(PROJECT_ID, { platform: AppPlatform.WEB })).to.deep.equal(
        expectedAppList
      );
      expect(listAppsStub).to.be.calledOnce;
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
      const firstCallStub = listAppsApiRequestStub(undefined, pageSize).resolves({
        body: { apps: expectedAppList.slice(0, pageSize), nextPageToken },
      });
      const secondCallStub = listAppsApiRequestStub(undefined, pageSize, nextPageToken).resolves({
        body: { apps: expectedAppList.slice(pageSize, appCountsPerPlatform * 3) },
      });

      expect(await listFirebaseApps(PROJECT_ID, { pageSize })).to.deep.equal(expectedAppList);
      expect(firstCallStub).to.be.calledOnce;
      expect(secondCallStub).to.be.calledOnce;
    });

    it("should reject if the first api call fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const listAppsStub = listAppsApiRequestStub().rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID);
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(listAppsStub).to.be.calledOnce;
    });

    it("should rejects if error is thrown in subsequence api call", async () => {
      const appCounts = 10;
      const pageSize = 5;
      const nextPageToken = "next-page-token";
      const expectedAppList = generateAndroidAppList(appCounts);
      const expectedError = new Error("HTTP Error 400: unexpected error");
      const firstCallStub = listAppsApiRequestStub(undefined, pageSize).resolves({
        body: { apps: expectedAppList.slice(0, pageSize), nextPageToken },
      });
      const secondCallStub = listAppsApiRequestStub(undefined, pageSize, nextPageToken).rejects(
        expectedError
      );

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, { pageSize });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(firstCallStub).to.be.calledOnce;
      expect(secondCallStub).to.be.calledOnce;
    });

    it("should reject if the list iOS apps fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const listAppsStub = listAppsApiRequestStub(AppPlatform.IOS).rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, { platform: AppPlatform.IOS });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase IOS apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(listAppsStub).to.be.calledOnce;
    });

    it("should reject if the list Android apps fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const listAppsStub = listAppsApiRequestStub(AppPlatform.ANDROID).rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, { platform: AppPlatform.ANDROID });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase ANDROID apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(listAppsStub).to.be.calledOnce;
    });

    it("should reject if the list Web apps fails", async () => {
      const expectedError = new Error("HTTP Error 404: Not Found");
      const listAppsStub = listAppsApiRequestStub(AppPlatform.WEB).rejects(expectedError);

      let err;
      try {
        await listFirebaseApps(PROJECT_ID, { platform: AppPlatform.WEB });
      } catch (e) {
        err = e;
      }
      expect(err.message).to.equal(
        "Failed to list Firebase WEB apps. See firebase-debug.log for more info."
      );
      expect(err.original).to.equal(expectedError);
      expect(listAppsStub).to.be.calledOnce;
    });

    function getListAppsResourceString(projectId: string, platform?: AppPlatform): string {
      let resourceSuffix;
      switch (platform) {
        case AppPlatform.IOS:
          resourceSuffix = "/iosApps";
          break;
        case AppPlatform.ANDROID:
          resourceSuffix = "/androidApps";
          break;
        case AppPlatform.WEB:
          resourceSuffix = "/webApps";
          break;
        default:
          resourceSuffix = ":searchApps";
          break;
      }

      return `/v1beta1/projects/${projectId}${resourceSuffix}`;
    }

    function listAppsApiRequestStub(
      platform?: AppPlatform,
      pageSize: number = 100,
      nextPageToken?: string
    ): sinon.SinonStub {
      const resource = getListAppsResourceString(PROJECT_ID, platform);
      const pageTokenQueryString = nextPageToken ? `&pageToken=${nextPageToken}` : "";
      return apiRequestStub.withArgs(
        "GET",
        `${resource}?pageSize=${pageSize}${pageTokenQueryString}`,
        {
          auth: true,
          origin: api.firebaseApiOrigin,
          timeout: 30000,
        }
      );
    }
  });
});
