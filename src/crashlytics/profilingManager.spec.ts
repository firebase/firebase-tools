import * as chai from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";
import * as chaiAsPromised from "chai-as-promised";

import {
  parseAndroidHashedId,
  createBucketName,
  parseBucketName,
  extractFileTtlDays,
  inspectHeapDumpBucket,
  getCrashlyticsP4sa,
  getCrashlyticsConsoleUrl,
  resolveAndroidApp,
  resolveAndroidAppId,
  getProfilingManagerConfig,
  updateProfilingManagerConfig,
  ensureHeapDumpStorageBucket,
  ensureHeapDumpP4saRole,
  enableHeapDumpCollection,
  disableHeapDumpCollection,
  CRASHLYTICS_SERVICE_NAME,
  STORAGE_OBJECT_CREATOR_ROLE,
  DEFAULT_BUCKET_LOCATION,
  DEFAULT_FILE_TTL_DAYS,
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
import * as utils from "../utils";

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

  describe("getCrashlyticsConsoleUrl", () => {
    it("should format the Crashlytics issues URL with android:<packageName>", () => {
      expect(getCrashlyticsConsoleUrl("appmon-otel-test", "dev.firebase.loadingspinner")).to.equal(
        "https://console.firebase.google.com/project/appmon-otel-test/crashlytics/app/android:dev.firebase.loadingspinner/issues",
      );
    });

    it("should fall back to the project Crashlytics page when packageName is omitted or blank", () => {
      expect(getCrashlyticsConsoleUrl(projectId)).to.equal(
        `https://console.firebase.google.com/project/${projectId}/crashlytics`,
      );
      expect(getCrashlyticsConsoleUrl(projectId, "   ")).to.equal(
        `https://console.firebase.google.com/project/${projectId}/crashlytics`,
      );
    });
  });

  describe("resolveAndroidApp", () => {
    const mockAndroidApp: appsModule.AndroidAppMetadata = {
      name: `projects/${projectId}/androidApps/${appId}`,
      projectId,
      appId,
      platform: appsModule.AppPlatform.ANDROID,
      packageName: "com.example.app",
    };

    it("should return canonical appId and packageName when --app is provided", async () => {
      sinon.stub(appsModule, "listFirebaseApps").resolves([mockAndroidApp]);
      const upperAppId = `1:${projectNumber}:android:${hashedAppId.toUpperCase()}`;

      const result = await resolveAndroidApp(projectId, { app: upperAppId });

      expect(result).to.deep.equal({
        appId,
        packageName: "com.example.app",
      });
    });

    it("should return appId and packageName when a single Android app exists in the project", async () => {
      sinon.stub(appsModule, "listFirebaseApps").resolves([mockAndroidApp]);

      const result = await resolveAndroidApp(projectId, {});

      expect(result).to.deep.equal({
        appId,
        packageName: "com.example.app",
      });
    });

    it("should omit packageName when absent on returned AppMetadata", async () => {
      sinon.stub(appsModule, "listFirebaseApps").resolves([
        {
          name: `projects/${projectId}/androidApps/${appId}`,
          projectId,
          appId,
          platform: appsModule.AppPlatform.ANDROID,
        },
      ]);

      const result = await resolveAndroidApp(projectId, {});

      expect(result).to.deep.equal({ appId });
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

    it("should return undefined when configuration does not exist yet (404)", async () => {
      nock(crashlyticsApiOrigin())
        .get(resourcePath)
        .reply(404, { error: { code: 404, message: "Not found" } });

      const result = await getProfilingManagerConfig(appId);
      expect(result).to.be.undefined;
      expect(nock.isDone()).to.be.true;
    });

    it("should rethrow non-404 API errors", async () => {
      nock(crashlyticsApiOrigin())
        .get(resourcePath)
        .reply(403, { error: { code: 403, message: "Permission denied" } });

      await expect(getProfilingManagerConfig(appId)).to.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError if the appId is invalid", async () => {
      await expect(getProfilingManagerConfig("invalid-app")).to.be.rejectedWith(
        FirebaseError,
        "Unable to get the projectId from the AppId.",
      );
    });
  });

  describe("parseBucketName, extractFileTtlDays & inspectHeapDumpBucket", () => {
    it("should strip the projects/_/buckets/ prefix and preserve bare bucket names", () => {
      expect(parseBucketName(expectedBucketResourceName)).to.equal(expectedBucketName);
      expect(parseBucketName(expectedBucketName)).to.equal(expectedBucketName);
      expect(parseBucketName("  projects/_/buckets/custom-bucket-a1b2c3  ")).to.equal(
        "custom-bucket-a1b2c3",
      );
      expect(parseBucketName("")).to.be.undefined;
      expect(parseBucketName("projects/_/buckets/")).to.be.undefined;
      expect(parseBucketName(undefined)).to.be.undefined;
    });

    it("should extract minimum live Delete lifecycle age or undefined when absent", () => {
      expect(
        extractFileTtlDays({
          lifecycle: {
            rule: [
              { action: { type: "Delete" }, condition: { age: 90 } },
              { action: { type: "Delete" }, condition: { age: 30 } },
              { action: { type: "Delete" }, condition: { age: 7, isLive: false } },
              { action: { type: "SetStorageClass" }, condition: { age: 14 } },
            ],
          },
        } as unknown as storage.BucketResponse),
      ).to.equal(30);
      expect(extractFileTtlDays(undefined)).to.be.undefined;
    });

    it("should inspect live bucket metadata, 404 missing buckets, and non-404 warnings", async () => {
      const getBucketStub = sinon.stub(storage, "getBucket");
      getBucketStub.onFirstCall().resolves({
        name: expectedBucketName,
        location: "US-CENTRAL1",
        lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 30 } }] },
      } as unknown as storage.BucketResponse);
      getBucketStub.onSecondCall().rejects(new FirebaseError("Not found", { status: 404 }));
      getBucketStub.onThirdCall().rejects(new FirebaseError("Permission denied", { status: 403 }));

      expect(await inspectHeapDumpBucket(expectedBucketResourceName)).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-CENTRAL1",
        fileTtlDays: 30,
      });
      expect(await inspectHeapDumpBucket(expectedBucketName)).to.deep.equal({
        bucketName: expectedBucketName,
        exists: false,
      });
      expect(await inspectHeapDumpBucket(expectedBucketName)).to.deep.equal({
        bucketName: expectedBucketName,
        warning: "Permission denied",
      });
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
      const createBucketStub = sinon.stub(storage, "createBucket").resolves({
        name: expectedBucketName,
        location: "US-CENTRAL1",
        lifecycle: expectedLifecycle,
      } as unknown as storage.BucketResponse);

      const result = await ensureHeapDumpStorageBucket(projectId, appId, "us-central1");

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-CENTRAL1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: true,
      });
      expect(getBucketStub).to.have.been.calledWith(expectedBucketName);
      expect(createBucketStub).to.have.been.calledOnceWithExactly(projectId, {
        name: expectedBucketName,
        location: "us-central1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      });
    });

    it("should default to DEFAULT_BUCKET_LOCATION when creating a new bucket with location omitted", async () => {
      sinon.stub(storage, "getBucket").rejects(new FirebaseError("Not found", { status: 404 }));
      const createBucketStub = sinon.stub(storage, "createBucket").resolves({
        name: expectedBucketName,
        location: "US-EAST1",
        lifecycle: expectedLifecycle,
      } as unknown as storage.BucketResponse);

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-EAST1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: true,
      });
      expect(createBucketStub).to.have.been.calledOnceWithExactly(projectId, {
        name: expectedBucketName,
        location: DEFAULT_BUCKET_LOCATION,
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

    it("should warn and reuse existing bucket when explicit location differs from existing bucket location", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        location: "US-CENTRAL1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon.stub(storage, "patchBucket");
      const createBucketStub = sinon.stub(storage, "createBucket");
      const logWarningStub = sinon.stub(utils, "logLabeledWarning");

      const result = await ensureHeapDumpStorageBucket(projectId, appId, "europe-west1");

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-CENTRAL1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
      expect(patchBucketStub).to.not.have.been.called;
      expect(createBucketStub).to.not.have.been.called;
      expect(logWarningStub).to.have.been.calledOnceWith(
        "crashlytics",
        sinon.match(
          (msg: string) =>
            msg.includes("US-CENTRAL1") &&
            msg.includes("europe-west1") &&
            msg.includes("cannot be changed"),
        ),
      );
    });

    it("should not warn when location is omitted and existing bucket is in a non-default region", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        location: "US-CENTRAL1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 30 } }] },
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      sinon.stub(storage, "patchBucket");
      sinon.stub(storage, "createBucket");
      const logWarningStub = sinon.stub(utils, "logLabeledWarning");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-CENTRAL1",
        fileTtlDays: 30,
        created: false,
      });
      expect(logWarningStub).to.not.have.been.called;
    });

    it("should not warn when existing bucket location matches explicit location case-insensitively", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        location: "US-EAST1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      sinon.stub(storage, "patchBucket");
      sinon.stub(storage, "createBucket");
      const logWarningStub = sinon.stub(utils, "logLabeledWarning");

      const result = await ensureHeapDumpStorageBucket(projectId, appId, "us-east1");

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-EAST1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
      expect(logWarningStub).to.not.have.been.called;
    });

    it("should reuse an existing Console conflict-suffixed bucket name when provided", async () => {
      const suffixedBucket = `${expectedBucketName}-a1b2c3`;
      const getBucketStub = sinon.stub(storage, "getBucket").resolves({
        name: suffixedBucket,
        projectNumber,
        location: "US-EAST1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(
        projectId,
        appId,
        undefined,
        `projects/_/buckets/${suffixedBucket}`,
      );

      expect(result).to.deep.equal({
        bucketName: suffixedBucket,
        exists: true,
        location: "US-EAST1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
      expect(getBucketStub).to.have.been.calledOnceWith(suffixedBucket);
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

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
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

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
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

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
      expect(patchBucketStub).to.have.been.calledWith(expectedBucketName, {
        iamConfiguration: { publicAccessPrevention: "enforced" },
      });
      expect(createBucketStub).to.not.have.been.called;
    });

    it("should do nothing if bucket exists with CORS, lifecycle, UBLA, and enforced PAP", async () => {
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        location: "US-EAST1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: expectedLifecycle,
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      const patchBucketStub = sinon.stub(storage, "patchBucket");
      const createBucketStub = sinon.stub(storage, "createBucket");

      const result = await ensureHeapDumpStorageBucket(projectId, appId);

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-EAST1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
        created: false,
      });
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
      nock(crashlyticsApiOrigin()).get(resourcePath).reply(404, {});
      sinon.stub(storage, "getBucket").resolves({
        name: expectedBucketName,
        projectNumber,
        location: "US-EAST1",
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

      expect(result).to.deep.equal({
        bucketName: expectedBucketName,
        exists: true,
        location: "US-EAST1",
        fileTtlDays: DEFAULT_FILE_TTL_DAYS,
      });
      expect(addBucketRoleStub).to.have.been.calledOnceWithExactly(
        expectedBucketName,
        getCrashlyticsP4sa(projectNumber),
        [STORAGE_OBJECT_CREATOR_ROLE],
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should reuse an existing Console conflict-suffixed bucket from ProfilingManagerConfig", async () => {
      const suffixedBucketName = `${expectedBucketName}-x1y2z3`;
      const suffixedResourceName = `projects/_/buckets/${suffixedBucketName}`;
      nock(crashlyticsApiOrigin()).get(resourcePath).reply(200, {
        bucket: suffixedResourceName,
        heapDumpCollectionEnabled: false,
      });
      const getBucketStub = sinon.stub(storage, "getBucket").resolves({
        name: suffixedBucketName,
        projectNumber,
        location: "US-CENTRAL1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 30 } }] },
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      sinon.stub(serviceusage, "generateServiceIdentityAndPoll").resolves();
      sinon.stub(storage, "addServiceAccountToBucketRoles").resolves({} as Policy);
      nock(crashlyticsApiOrigin())
        .patch(resourcePath, {
          bucket: suffixedResourceName,
          heapDumpCollectionEnabled: true,
        })
        .query({ updateMask: "bucket,heapDumpCollectionEnabled" })
        .reply(200, {
          bucket: suffixedResourceName,
          heapDumpCollectionEnabled: true,
        });

      const result = await enableHeapDumpCollection(projectId, appId);

      expect(result).to.deep.equal({
        bucketName: suffixedBucketName,
        exists: true,
        location: "US-CENTRAL1",
        fileTtlDays: 30,
      });
      expect(getBucketStub).to.have.been.calledOnceWith(suffixedBucketName);
      expect(nock.isDone()).to.be.true;
    });

    it("should skip re-fetching ProfilingManagerConfig when existingBucketName is already resolved", async () => {
      const suffixedBucketName = `${expectedBucketName}-x1y2z3`;
      const suffixedResourceName = `projects/_/buckets/${suffixedBucketName}`;
      sinon.stub(storage, "getBucket").resolves({
        name: suffixedBucketName,
        projectNumber,
        location: "US-EAST1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: { rule: DEFAULT_LIFECYCLE_RULES },
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);
      sinon.stub(serviceusage, "generateServiceIdentityAndPoll").resolves();
      sinon.stub(storage, "addServiceAccountToBucketRoles").resolves({} as Policy);
      nock(crashlyticsApiOrigin())
        .patch(resourcePath, {
          bucket: suffixedResourceName,
          heapDumpCollectionEnabled: true,
        })
        .query({ updateMask: "bucket,heapDumpCollectionEnabled" })
        .reply(200, {
          bucket: suffixedResourceName,
          heapDumpCollectionEnabled: true,
        });

      const result = await enableHeapDumpCollection(
        projectId,
        appId,
        undefined,
        suffixedBucketName,
      );

      expect(result.bucketName).to.equal(suffixedBucketName);
      expect(nock.isDone()).to.be.true;
    });

    it("should clean up a newly created bucket when P4SA IAM setup fails and preserve pre-existing buckets", async () => {
      const iamError = new FirebaseError("IAM failure", { status: 403 });
      nock(crashlyticsApiOrigin()).get(resourcePath).reply(404, {});
      const getBucketStub = sinon
        .stub(storage, "getBucket")
        .rejects(new FirebaseError("Not found", { status: 404 }));
      sinon.stub(storage, "createBucket").resolves({
        name: expectedBucketName,
        location: "US-EAST1",
        lifecycle: { rule: DEFAULT_LIFECYCLE_RULES },
      } as unknown as storage.BucketResponse);
      sinon.stub(serviceusage, "generateServiceIdentityAndPoll").resolves();
      sinon.stub(storage, "addServiceAccountToBucketRoles").rejects(iamError);
      const deleteBucketStub = sinon.stub(storage, "deleteBucket").resolves();

      await expect(enableHeapDumpCollection(projectId, appId)).to.be.rejectedWith(iamError);
      expect(deleteBucketStub).to.have.been.calledOnceWith(expectedBucketName);

      // Pre-existing bucket should never be deleted on failure.
      deleteBucketStub.resetHistory();
      nock(crashlyticsApiOrigin()).get(resourcePath).reply(200, {});
      getBucketStub.resolves({
        name: expectedBucketName,
        projectNumber,
        location: "US-EAST1",
        cors: DEFAULT_CORS_RULES,
        lifecycle: { rule: DEFAULT_LIFECYCLE_RULES },
        iamConfiguration: DEFAULT_IAM_CONFIGURATION,
      } as unknown as storage.BucketResponse);

      await expect(enableHeapDumpCollection(projectId, appId)).to.be.rejectedWith(iamError);
      expect(deleteBucketStub).to.not.have.been.called;
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
