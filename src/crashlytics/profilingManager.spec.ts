import * as chai from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";
import * as chaiAsPromised from "chai-as-promised";

import {
  createBucketName,
  getCrashlyticsP4sa,
  resolveAndroidAppId,
  getProfilingManagerConfig,
  updateProfilingManagerConfig,
  ensureHeapDumpStorageBucket,
  ensureHeapDumpP4saRole,
  CRASHLYTICS_SERVICE_NAME,
  STORAGE_OBJECT_CREATOR_ROLE,
  DEFAULT_CORS_ORIGINS,
  DEFAULT_FILE_TTL_DAYS,
} from "./profilingManager";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import * as storage from "../gcp/storage";
import * as resourceManager from "../gcp/resourceManager";
import * as serviceusage from "../gcp/serviceusage";
import * as appsModule from "../management/apps";
import * as promptModule from "../prompt";
import { Policy } from "../gcp/iam";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("profilingManager", () => {
  const projectNumber = "1234567890";
  const hashedAppId = "abcdef123456";
  const appId = `1:${projectNumber}:android:${hashedAppId}`;
  const expectedBucketName = `firebasecrashlytics-heap-dumps-${hashedAppId}`;
  const projectId = "my-test-project";

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  describe("createBucketName", () => {
    it("should generate the deterministic bucket name for a valid Android app ID", () => {
      const result = createBucketName(appId);
      expect(result).to.equal(expectedBucketName);
    });

    it("should lowercase uppercase characters in the hashed package name", () => {
      const upperAppId = `1:${projectNumber}:android:ABCDEF123456`;
      const result = createBucketName(upperAppId);
      expect(result).to.equal(expectedBucketName);
    });

    it("should throw a FirebaseError for an iOS app ID", () => {
      const iosAppId = `1:${projectNumber}:ios:${hashedAppId}`;
      expect(() => createBucketName(iosAppId)).to.throw(
        FirebaseError,
        "Heap dump collection is only supported for Android apps.",
      );
    });

    it("should throw a FirebaseError for an invalid app ID format", () => {
      expect(() => createBucketName("invalid-app-id")).to.throw(FirebaseError);
    });
  });

  describe("getCrashlyticsP4sa", () => {
    it("should return the formatted Crashlytics service agent email", () => {
      expect(getCrashlyticsP4sa(projectNumber)).to.equal(
        `service-${projectNumber}@gcp-sa-crashlytics.iam.gserviceaccount.com`,
      );
    });
  });

  describe("resolveAndroidAppId", () => {
    it("should return the explicitly provided valid Android app ID", async () => {
      const result = await resolveAndroidAppId(projectId, { app: appId });
      expect(result).to.equal(appId);
    });

    it("should throw a FirebaseError when an invalid or non-Android app ID is provided", async () => {
      await expect(
        resolveAndroidAppId(projectId, { app: `1:${projectNumber}:ios:${hashedAppId}` }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Heap dump collection is only supported for Android apps.",
      );
    });

    it("should throw a FirebaseError when no Android apps exist in the project", async () => {
      sinon.stub(appsModule, "listFirebaseApps").resolves([]);

      await expect(resolveAndroidAppId(projectId, {})).to.be.rejectedWith(
        FirebaseError,
        `No Android apps found in project '${projectId}'`,
      );
    });

    it("should automatically return the app ID when exactly one Android app exists", async () => {
      const mockApps: appsModule.AndroidAppMetadata[] = [
        {
          name: `projects/${projectId}/androidApps/${appId}`,
          projectId,
          appId,
          platform: appsModule.AppPlatform.ANDROID,
          packageName: "com.example.app",
        },
      ];
      sinon.stub(appsModule, "listFirebaseApps").resolves(mockApps);

      const result = await resolveAndroidAppId(projectId, {});
      expect(result).to.equal(appId);
    });

    it("should throw a FirebaseError when multiple Android apps exist in non-interactive mode", async () => {
      const secondAppId = `1:${projectNumber}:android:fedcba654321`;
      const mockApps: appsModule.AndroidAppMetadata[] = [
        {
          name: `projects/${projectId}/androidApps/${appId}`,
          projectId,
          appId,
          platform: appsModule.AppPlatform.ANDROID,
          packageName: "com.example.one",
        },
        {
          name: `projects/${projectId}/androidApps/${secondAppId}`,
          projectId,
          appId: secondAppId,
          platform: appsModule.AppPlatform.ANDROID,
          packageName: "com.example.two",
        },
      ];
      sinon.stub(appsModule, "listFirebaseApps").resolves(mockApps);

      await expect(resolveAndroidAppId(projectId, { nonInteractive: true })).to.be.rejectedWith(
        FirebaseError,
        `Project '${projectId}' has multiple Android apps. Please specify an app ID with '--app <appID>'.`,
      );
    });

    it("should prompt the user to select an app when multiple Android apps exist interactively", async () => {
      const secondAppId = `1:${projectNumber}:android:fedcba654321`;
      const thirdAppId = `1:${projectNumber}:android:111111222222`;
      const mockApps: appsModule.AndroidAppMetadata[] = [
        {
          name: `projects/${projectId}/androidApps/${appId}`,
          projectId,
          appId,
          displayName: "First App",
          platform: appsModule.AppPlatform.ANDROID,
          packageName: "com.example.one",
        },
        {
          name: `projects/${projectId}/androidApps/${secondAppId}`,
          projectId,
          appId: secondAppId,
          platform: appsModule.AppPlatform.ANDROID,
          packageName: "com.example.two",
        },
        {
          name: `projects/${projectId}/androidApps/${thirdAppId}`,
          projectId,
          appId: thirdAppId,
          platform: appsModule.AppPlatform.ANDROID,
          packageName: "",
        },
      ];
      sinon.stub(appsModule, "listFirebaseApps").resolves(mockApps);
      const selectStub = sinon.stub(promptModule, "select").resolves(secondAppId);

      const result = await resolveAndroidAppId(projectId, {});
      expect(result).to.equal(secondAppId);
      expect(selectStub).to.have.been.calledOnceWith({
        message: "Select an Android app:",
        choices: [
          { name: `First App (${appId})`, value: appId },
          { name: `com.example.two (${secondAppId})`, value: secondAppId },
          { name: `${thirdAppId} (${thirdAppId})`, value: thirdAppId },
        ],
      });
    });
  });

  describe("getProfilingManagerConfig", () => {
    it("should return the configuration on successful response", async () => {
      const mockResponse = {
        configuration: {
          gcsBucket: expectedBucketName,
          heapDumpCollectionEnabled: true,
        },
      };

      nock(crashlyticsApiOrigin())
        .get(`/v1/projects/${projectNumber}/apps/${appId}/appconfig:profilingManager`)
        .reply(200, mockResponse);

      const result = await getProfilingManagerConfig(appId);
      expect(result).to.deep.equal({
        gcsBucket: expectedBucketName,
        heapDumpCollectionEnabled: true,
      });
      expect(nock.isDone()).to.be.true;
    });

    it("should return default values when configuration is empty", async () => {
      nock(crashlyticsApiOrigin())
        .get(`/v1/projects/${projectNumber}/apps/${appId}/appconfig:profilingManager`)
        .reply(200, {});

      const result = await getProfilingManagerConfig(appId);
      expect(result).to.deep.equal({
        gcsBucket: "",
        heapDumpCollectionEnabled: false,
      });
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      await expect(getProfilingManagerConfig("invalid-app")).to.be.rejectedWith(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });

  describe("updateProfilingManagerConfig", () => {
    it("should send the update request successfully", async () => {
      nock(crashlyticsApiOrigin())
        .post(`/v1/projects/${projectNumber}/apps/${appId}/appconfig:profilingManager`, {
          projectNumber,
          gmpAppId: appId,
          configuration: {
            gcsBucket: expectedBucketName,
            heapDumpCollectionEnabled: true,
          },
        })
        .reply(200, {});

      await updateProfilingManagerConfig(appId, {
        gcsBucket: expectedBucketName,
        heapDumpCollectionEnabled: true,
      });

      expect(nock.isDone()).to.be.true;
    });

    it("should default empty configuration fields when omitted", async () => {
      nock(crashlyticsApiOrigin())
        .post(`/v1/projects/${projectNumber}/apps/${appId}/appconfig:profilingManager`, {
          projectNumber,
          gmpAppId: appId,
          configuration: {
            gcsBucket: "",
            heapDumpCollectionEnabled: false,
          },
        })
        .reply(200, {});

      await updateProfilingManagerConfig(appId, {});

      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      await expect(
        updateProfilingManagerConfig("invalid-app", {
          gcsBucket: expectedBucketName,
          heapDumpCollectionEnabled: true,
        }),
      ).to.be.rejectedWith(FirebaseError, "Unable to get the projectId from the AppId.");
    });
  });

  describe("ensureHeapDumpStorageBucket", () => {
    const expectedCors = [
      {
        origin: DEFAULT_CORS_ORIGINS,
        method: ["GET", "HEAD", "OPTIONS"],
        responseHeader: ["Content-Type", "Access-Control-Allow-Origin", "Content-Length"],
      },
    ];
    const expectedLifecycle = {
      rule: [
        {
          action: { type: "Delete" },
          condition: { age: DEFAULT_FILE_TTL_DAYS },
        },
      ],
    };

    it("should create a new bucket with CORS and 90-day TTL when it does not exist", async () => {
      const notFoundError = new FirebaseError("Not found", { status: 404 });
      const getBucketStub = sinon.stub(storage, "getBucket").rejects(notFoundError);
      const createBucketStub = sinon
        .stub(storage, "createBucket")
        .resolves({} as storage.BucketResponse);

      const result = await ensureHeapDumpStorageBucket(projectId, appId, "us-central1");

      expect(result).to.equal(expectedBucketName);
      expect(getBucketStub).to.have.been.calledWith(expectedBucketName);
      expect(createBucketStub).to.have.been.calledWith(
        projectId,
        {
          name: expectedBucketName,
          location: "us-central1",
          cors: expectedCors,
          lifecycle: expectedLifecycle,
        },
        true,
      );
    });

    it("should rethrow non-404 errors from getBucket", async () => {
      const forbiddenError = new FirebaseError("Forbidden", { status: 403 });
      sinon.stub(storage, "getBucket").rejects(forbiddenError);
      const createBucketStub = sinon.stub(storage, "createBucket");

      await expect(ensureHeapDumpStorageBucket(projectId, appId)).to.be.rejectedWith(
        forbiddenError,
      );
      expect(createBucketStub).to.not.have.been.called;
    });

    it("should patch CORS and lifecycle if bucket exists without either configuration", async () => {
      sinon
        .stub(storage, "getBucket")
        .resolves({ name: expectedBucketName, cors: [] } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon
        .stub(storage, "patchBucket")
        .resolves({} as storage.BucketResponse);
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(patchBucketStub).to.have.been.calledWith(expectedBucketName, {
        cors: expectedCors,
        lifecycle: expectedLifecycle,
      });
      expect(createBucketStub).to.not.have.been.called;
    });

    it("should patch only lifecycle if bucket exists with CORS but without lifecycle", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        cors: expectedCors,
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon
        .stub(storage, "patchBucket")
        .resolves({} as storage.BucketResponse);
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(patchBucketStub).to.have.been.calledWith(expectedBucketName, {
        lifecycle: expectedLifecycle,
      });
      expect(createBucketStub).to.not.have.been.called;
    });

    it("should do nothing if bucket exists with both CORS and lifecycle configuration", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        cors: expectedCors,
        lifecycle: expectedLifecycle,
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon.stub(storage, "patchBucket");
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(patchBucketStub).to.not.have.been.called;
      expect(createBucketStub).to.not.have.been.called;
    });
  });

  describe("ensureHeapDumpP4saRole", () => {
    it("should generate service identity and add the role if the P4SA does not currently have it", async () => {
      const p4saEmail = getCrashlyticsP4sa(projectNumber);
      const generateIdentityStub = sinon
        .stub(serviceusage, "generateServiceIdentityAndPoll")
        .resolves();
      sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(false);
      const addRoleStub = sinon
        .stub(resourceManager, "addServiceAccountToRoles")
        .resolves({} as Policy);

      await ensureHeapDumpP4saRole(projectId, projectNumber);

      expect(generateIdentityStub).to.have.been.calledOnceWith(
        projectNumber,
        CRASHLYTICS_SERVICE_NAME,
        "crashlytics",
      );
      expect(addRoleStub).to.have.been.calledWith(
        projectId,
        p4saEmail,
        [STORAGE_OBJECT_CREATOR_ROLE],
        true,
      );
    });

    it("should not add the role if the P4SA already has it", async () => {
      const generateIdentityStub = sinon
        .stub(serviceusage, "generateServiceIdentityAndPoll")
        .resolves();
      sinon.stub(resourceManager, "serviceAccountHasRoles").resolves(true);
      const addRoleStub = sinon.stub(resourceManager, "addServiceAccountToRoles");

      await ensureHeapDumpP4saRole(projectId, projectNumber);

      expect(generateIdentityStub).to.have.been.calledOnceWith(
        projectNumber,
        CRASHLYTICS_SERVICE_NAME,
        "crashlytics",
      );
      expect(addRoleStub).to.not.have.been.called;
    });
  });
});
