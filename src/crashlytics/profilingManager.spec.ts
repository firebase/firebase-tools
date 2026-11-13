import * as chai from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";
import * as chaiAsPromised from "chai-as-promised";

import {
  parseAndroidHashedId,
  createBucketName,
  getCrashlyticsP4sa,
  resolveAndroidAppId,
  getProfilingManagerConfig,
  updateProfilingManagerConfig,
  ensureHeapDumpStorageBucket,
  ensureHeapDumpP4saRole,
  enableHeapDumpCollection,
  disableHeapDumpCollection,
  CRASHLYTICS_SERVICE_NAME,
  STORAGE_OBJECT_CREATOR_ROLE,
  DEFAULT_CORS_RULES,
  DEFAULT_LIFECYCLE_RULES,
  DEFAULT_IAM_CONFIGURATION,
} from "./profilingManager";
import { FirebaseError } from "../error";
import { crashlyticsApiOrigin } from "../api";
import * as storage from "../gcp/storage";
import * as serviceusage from "../gcp/serviceusage";
import * as appsModule from "../management/apps";
import { Policy } from "../gcp/iam";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("profilingManager", () => {
  const projectNumber = "1234567890";
  const hashedAppId = "abcdef123456";
  const appId = `1:${projectNumber}:android:${hashedAppId}`;
  const expectedBucketName = `firebasecrashlytics-heap-dumps-${hashedAppId}`;
  const expectedBucketResourceName = `projects/_/buckets/${expectedBucketName}`;
  const projectId = "my-test-project";
  const resourcePath = `/v1alpha/projects/${projectNumber}/apps/${appId}/profilingManagerConfig`;

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  describe("parseAndroidHashedId & createBucketName", () => {
    it("should extract lowercased hashed ID and generate deterministic bucket name for a valid Android app ID", () => {
      expect(parseAndroidHashedId(appId)).to.equal(hashedAppId);
      expect(createBucketName(appId)).to.equal(expectedBucketName);
    });

    it("should lowercase uppercase characters in the hashed package name", () => {
      const upperAppId = `1:${projectNumber}:android:ABCDEF123456`;
      expect(parseAndroidHashedId(upperAppId)).to.equal(hashedAppId);
      expect(createBucketName(upperAppId)).to.equal(expectedBucketName);
    });

    it("should throw a FirebaseError for an iOS app ID", () => {
      const iosAppId = `1:${projectNumber}:ios:${hashedAppId}`;
      expect(() => createBucketName(iosAppId)).to.throw(
        FirebaseError,
        "Heap dump collection is only supported for Android apps.",
      );
    });

    it("should throw a FirebaseError for an invalid or empty-segment app ID format", () => {
      expect(() => createBucketName("invalid-app-id")).to.throw(FirebaseError);
      expect(() => createBucketName(`1:${projectNumber}:android:`)).to.throw(FirebaseError);
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
    const mockAndroidApp: appsModule.AndroidAppMetadata = {
      name: `projects/${projectId}/androidApps/${appId}`,
      projectId,
      appId,
      platform: appsModule.AppPlatform.ANDROID,
      packageName: "com.example.app",
    };

    it("should return the explicitly provided valid Android app ID when it belongs to the project", async () => {
      const listAppsStub = sinon.stub(appsModule, "listFirebaseApps").resolves([mockAndroidApp]);

      const result = await resolveAndroidAppId(projectId, { app: appId });

      expect(result).to.equal(appId);
      expect(listAppsStub).to.have.been.calledOnceWith(projectId, appsModule.AppPlatform.ANDROID);
    });

    it("should match --app case-insensitively and return the canonical Firebase app ID", async () => {
      sinon.stub(appsModule, "listFirebaseApps").resolves([mockAndroidApp]);
      const upperAppId = `1:${projectNumber}:android:${hashedAppId.toUpperCase()}`;

      const result = await resolveAndroidAppId(projectId, { app: upperAppId });

      expect(result).to.equal(appId);
    });

    it("should throw a FirebaseError when the provided Android app ID belongs to a different project", async () => {
      const otherProjectAppId = "1:9999999999:android:dba41e8917c618732010d1";
      sinon.stub(appsModule, "listFirebaseApps").resolves([mockAndroidApp]);

      await expect(resolveAndroidAppId(projectId, { app: otherProjectAppId })).to.be.rejectedWith(
        FirebaseError,
        `Android app '${otherProjectAppId}' was not found in project '${projectId}'.`,
      );
    });

    it("should throw a FirebaseError when the provided Android app ID does not exist in the project", async () => {
      const fabricatedAppId = `1:${projectNumber}:android:ffffffffffffffff`;
      sinon.stub(appsModule, "listFirebaseApps").resolves([mockAndroidApp]);

      await expect(resolveAndroidAppId(projectId, { app: fabricatedAppId })).to.be.rejectedWith(
        FirebaseError,
        `Android app '${fabricatedAppId}' was not found in project '${projectId}'.`,
      );
    });

    it("should throw a FirebaseError before listing apps when an invalid or non-Android app ID is provided", async () => {
      const listAppsStub = sinon.stub(appsModule, "listFirebaseApps");

      await expect(
        resolveAndroidAppId(projectId, { app: `1:${projectNumber}:ios:${hashedAppId}` }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Heap dump collection is only supported for Android apps.",
      );
      expect(listAppsStub).to.not.have.been.called;
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
      ];
      sinon.stub(appsModule, "listFirebaseApps").resolves(mockApps);
      const selectAppStub = sinon.stub(appsModule, "selectAppInteractively").resolves(mockApps[1]);

      const result = await resolveAndroidAppId(projectId, {});
      expect(result).to.equal(secondAppId);
      expect(selectAppStub).to.have.been.calledOnceWith(mockApps, appsModule.AppPlatform.ANDROID, {
        message: "Select an Android app:",
      });
    });
  });

  describe("getProfilingManagerConfig", () => {
    it("should return the configuration on successful response", async () => {
      const mockResponse = {
        name: `projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
        bucket: expectedBucketResourceName,
        heapDumpCollectionEnabled: true,
      };

      nock(crashlyticsApiOrigin()).get(resourcePath).reply(200, mockResponse);

      const result = await getProfilingManagerConfig(appId);
      expect(result).to.deep.equal(mockResponse);
      expect(nock.isDone()).to.be.true;
    });

    it("should return empty object when configuration is empty", async () => {
      nock(crashlyticsApiOrigin()).get(resourcePath).reply(200, {});

      const result = await getProfilingManagerConfig(appId);
      expect(result).to.deep.equal({});
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      await expect(getProfilingManagerConfig("invalid-app")).to.be.rejectedWith(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });

  describe("updateProfilingManagerConfig", () => {
    it("should send the PATCH update request with field mask successfully", async () => {
      nock(crashlyticsApiOrigin())
        .patch(resourcePath, {
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: true,
        })
        .query({ updateMask: "bucket,heapDumpCollectionEnabled" })
        .reply(200, {
          name: `projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: true,
        });

      await updateProfilingManagerConfig(
        appId,
        {
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: true,
        },
        "bucket,heapDumpCollectionEnabled",
      );

      expect(nock.isDone()).to.be.true;
    });

    it("should send partial updateMask when updating only heapDumpCollectionEnabled", async () => {
      nock(crashlyticsApiOrigin())
        .patch(resourcePath, {
          heapDumpCollectionEnabled: false,
        })
        .query({ updateMask: "heapDumpCollectionEnabled" })
        .reply(200, {
          name: `projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: false,
        });

      await updateProfilingManagerConfig(
        appId,
        {
          heapDumpCollectionEnabled: false,
        },
        "heapDumpCollectionEnabled",
      );

      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      await expect(
        updateProfilingManagerConfig(
          "invalid-app",
          {
            bucket: expectedBucketResourceName,
            heapDumpCollectionEnabled: true,
          },
          "bucket,heapDumpCollectionEnabled",
        ),
      ).to.be.rejectedWith(FirebaseError, "Unable to get the projectId from the AppId.");
    });
  });

  describe("ensureHeapDumpStorageBucket", () => {
    const expectedLifecycle = {
      rule: DEFAULT_LIFECYCLE_RULES,
    };

    it("should create a new bucket with CORS, 90-day TTL, UBLA, and enforced PAP when it does not exist", async () => {
      const notFoundError = new FirebaseError("Not found", { status: 404 });
      const getBucketStub = sinon.stub(storage, "getBucket").rejects(notFoundError);
      const createBucketStub = sinon
        .stub(storage, "createBucket")
        .resolves({} as storage.BucketResponse);

      const result = await ensureHeapDumpStorageBucket(projectId, appId, "us-central1");

      expect(result).to.equal(expectedBucketName);
      expect(getBucketStub).to.have.been.calledWith(expectedBucketName);
      expect(createBucketStub).to.have.been.calledOnceWithExactly(projectId, {
        name: expectedBucketName,
        location: "us-central1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      });
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

    it("should throw a FirebaseError if the bucket is owned by another project", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber: "9999999999",
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon.stub(storage, "patchBucket");

      await expect(ensureHeapDumpStorageBucket(projectId, appId)).to.be.rejectedWith(
        FirebaseError,
        `Cloud Storage bucket '${expectedBucketName}' already exists and is owned by another project.`,
      );
      expect(patchBucketStub).to.not.have.been.called;
    });

    it("should patch CORS, lifecycle, and iamConfiguration if bucket exists without required settings", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon
        .stub(storage, "patchBucket")
        .resolves({} as storage.BucketResponse);
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(patchBucketStub).to.have.been.calledWith(expectedBucketName, {
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      });
      expect(createBucketStub).to.not.have.been.called;
    });

    it("should merge required CORS and lifecycle rules with pre-existing unrelated rules", async () => {
      const existingCors: storage.CorsRule = { origin: ["https://example.com"], method: ["GET"] };
      const existingLifecycleRule: storage.LifecycleRule = {
        action: { type: "AbortIncompleteMultipartUpload" },
        condition: { age: 7 },
      };
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        cors: [existingCors],
        lifecycle: { rule: [existingLifecycleRule] },
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon
        .stub(storage, "patchBucket")
        .resolves({} as storage.BucketResponse);

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(patchBucketStub).to.have.been.calledWith(expectedBucketName, {
        cors: [existingCors, ...DEFAULT_CORS_RULES],
        lifecycle: { rule: [existingLifecycleRule, ...DEFAULT_LIFECYCLE_RULES] },
      });
    });

    it("should patch only missing publicAccessPrevention when UBLA, CORS, and lifecycle are already configured", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: {
          publicAccessPrevention: "inherited",
          uniformBucketLevelAccess: { enabled: true },
        },
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon
        .stub(storage, "patchBucket")
        .resolves({} as storage.BucketResponse);
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(patchBucketStub).to.have.been.calledWith(expectedBucketName, {
        iamConfiguration: { publicAccessPrevention: "enforced" },
      });
      expect(createBucketStub).to.not.have.been.called;
    });

    it("should do nothing if bucket exists with CORS, lifecycle, UBLA, and enforced PAP", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
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
    it("should generate service identity and scope roles/storage.objectCreator to the target bucket", async () => {
      const p4saEmail = getCrashlyticsP4sa(projectNumber);
      const generateIdentityStub = sinon
        .stub(serviceusage, "generateServiceIdentityAndPoll")
        .resolves();
      const addBucketRoleStub = sinon
        .stub(storage, "addServiceAccountToBucketRoles")
        .resolves({} as Policy);

      await ensureHeapDumpP4saRole(projectNumber, expectedBucketName);

      expect(generateIdentityStub).to.have.been.calledOnceWith(
        projectNumber,
        CRASHLYTICS_SERVICE_NAME,
        "crashlytics",
      );
      expect(addBucketRoleStub).to.have.been.calledOnceWithExactly(expectedBucketName, p4saEmail, [
        STORAGE_OBJECT_CREATOR_ROLE,
      ]);
    });
  });

  describe("enableHeapDumpCollection & disableHeapDumpCollection", () => {
    it("should orchestrate bucket provisioning, bucket-scoped P4SA role setup, and config enablement", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        cors: DEFAULT_CORS_RULES,
        lifecycle: { rule: DEFAULT_LIFECYCLE_RULES },
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      sinon.stub(serviceusage, "generateServiceIdentityAndPoll").resolves();
      const addBucketRoleStub = sinon
        .stub(storage, "addServiceAccountToBucketRoles")
        .resolves({} as Policy);
      nock(crashlyticsApiOrigin())
        .patch(resourcePath, {
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: true,
        })
        .query({ updateMask: "bucket,heapDumpCollectionEnabled" })
        .reply(200, {
          name: `projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: true,
        });

      const result = await enableHeapDumpCollection(projectId, appId);

      expect(result).to.equal(expectedBucketName);
      expect(addBucketRoleStub).to.have.been.calledOnceWithExactly(
        expectedBucketName,
        getCrashlyticsP4sa(projectNumber),
        [STORAGE_OBJECT_CREATOR_ROLE],
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should disable heap dump collection via partial updateMask while preserving bucket", async () => {
      nock(crashlyticsApiOrigin())
        .patch(resourcePath, {
          heapDumpCollectionEnabled: false,
        })
        .query({ updateMask: "heapDumpCollectionEnabled" })
        .reply(200, {
          name: `projects/${projectNumber}/apps/${appId}/profilingManagerConfig`,
          bucket: expectedBucketResourceName,
          heapDumpCollectionEnabled: false,
        });

      await disableHeapDumpCollection(appId);

      expect(nock.isDone()).to.be.true;
    });
  });
});
