import { expect } from "chai";
import * as sinon from "sinon";
import * as nock from "nock";
import { firebaseApiOrigin } from "../../api";
import * as pollUtils from "../../operation-poller";
import {
  buildAppNamespace,
  buildParentString,
  buildProvisionRequest,
  provisionFirebaseApp,
} from "./provision";
import {
  ProvisionAppOptions,
  ProvisionFirebaseAppOptions,
  ProvisionFirebaseAppResponse,
} from "./types";
import { FirebaseError } from "../../error";
import { AppPlatform } from "../apps";

// Test constants
const BUNDLE_ID = "com.example.testapp";
const PACKAGE_NAME = "com.example.androidapp";
const WEB_APP_ID = "web-app-123";
const PROJECT_DISPLAY_NAME = "Test Project";
const REQUEST_ID = "test-request-id-123";
const LOCATION = "us-central1";
const OPERATION_RESOURCE_NAME = "operations/provision.123456789";
const APP_RESOURCE = "projects/test-project/apps/123456789";
const CONFIG_DATA = "base64-encoded-config-data";
const CONFIG_MIME_TYPE = "application/json";

describe("Provision module", () => {
  let sandbox: sinon.SinonSandbox;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    pollOperationStub = sandbox.stub(pollUtils, "pollOperation");
    pollOperationStub.throws("Unexpected poll call");
    nock.disableNetConnect();
  });

  afterEach(() => {
    sandbox.restore();
    nock.enableNetConnect();
    nock.cleanAll();
  });

  // Phase 1: buildAppNamespace helper function tests
  describe("buildAppNamespace", () => {
    it("should return appId when provided (takes precedence)", () => {
      const appWithAppId: ProvisionAppOptions = {
        platform: AppPlatform.IOS,
        bundleId: BUNDLE_ID,
        appId: "1:123456789:ios:abcdef123456",
      };

      const result = buildAppNamespace(appWithAppId);

      expect(result).to.equal("1:123456789:ios:abcdef123456");
    });

    it("should return bundleId for iOS apps", () => {
      const iosApp: ProvisionAppOptions = {
        platform: AppPlatform.IOS,
        bundleId: BUNDLE_ID,
      };

      const result = buildAppNamespace(iosApp);

      expect(result).to.equal(BUNDLE_ID);
    });

    it("should return packageName for Android apps", () => {
      const androidApp: ProvisionAppOptions = {
        platform: AppPlatform.ANDROID,
        packageName: PACKAGE_NAME,
      };

      const result = buildAppNamespace(androidApp);

      expect(result).to.equal(PACKAGE_NAME);
    });

    it("should return webAppId for Web apps", () => {
      const webApp: ProvisionAppOptions = {
        platform: AppPlatform.WEB,
        webAppId: WEB_APP_ID,
      };

      const result = buildAppNamespace(webApp);

      expect(result).to.equal(WEB_APP_ID);
    });

    it("should throw error for unsupported platform", () => {
      const unsupportedApp = {
        platform: "UNSUPPORTED" as any,
        bundleId: BUNDLE_ID,
      };

      expect(() => buildAppNamespace(unsupportedApp)).to.throw("Unsupported platform");
    });

    it("should throw error when iOS bundleId is empty", () => {
      const iosApp: ProvisionAppOptions = {
        platform: AppPlatform.IOS,
        bundleId: "",
      };

      expect(() => buildAppNamespace(iosApp)).to.throw("App namespace cannot be empty");
    });

    it("should throw error when Android packageName is empty", () => {
      const androidApp: ProvisionAppOptions = {
        platform: AppPlatform.ANDROID,
        packageName: "",
      };

      expect(() => buildAppNamespace(androidApp)).to.throw("App namespace cannot be empty");
    });

    it("should throw error when Web webAppId is empty", () => {
      const webApp: ProvisionAppOptions = {
        platform: AppPlatform.WEB,
        webAppId: "",
      };

      expect(() => buildAppNamespace(webApp)).to.throw("App namespace cannot be empty");
    });

    it("should throw error when iOS bundleId is missing", () => {
      const iosApp: ProvisionAppOptions = {
        platform: AppPlatform.IOS,
      };

      expect(() => buildAppNamespace(iosApp)).to.throw("App namespace cannot be empty");
    });

    it("should throw error when Android packageName is missing", () => {
      const androidApp: ProvisionAppOptions = {
        platform: AppPlatform.ANDROID,
      };

      expect(() => buildAppNamespace(androidApp)).to.throw("App namespace cannot be empty");
    });

    it("should throw error when Web webAppId is missing", () => {
      const webApp: ProvisionAppOptions = {
        platform: AppPlatform.WEB,
      };

      expect(() => buildAppNamespace(webApp)).to.throw("App namespace cannot be empty");
    });

    it("should fall back to bundleId when appId is empty string", () => {
      const appWithEmptyId: ProvisionAppOptions = {
        platform: AppPlatform.IOS,
        bundleId: BUNDLE_ID,
        appId: "",
      };

      const result = buildAppNamespace(appWithEmptyId);
      expect(result).to.equal(BUNDLE_ID);
    });
  });

  // Phase 2: buildParentString helper function tests
  describe("buildParentString", () => {
    it("should format existing project parent correctly", () => {
      const parent = {
        type: "existing_project" as const,
        projectId: "my-project-123",
      };

      const result = buildParentString(parent);

      expect(result).to.equal("projects/my-project-123");
    });

    it("should format organization parent correctly", () => {
      const parent = {
        type: "organization" as const,
        organizationId: "123456789",
      };

      const result = buildParentString(parent);

      expect(result).to.equal("organizations/123456789");
    });

    it("should format folder parent correctly", () => {
      const parent = {
        type: "folder" as const,
        folderId: "987654321",
      };

      const result = buildParentString(parent);

      expect(result).to.equal("folders/987654321");
    });

    it("should throw error for unsupported parent type", () => {
      const unsupportedParent = {
        type: "invalid" as any,
        projectId: "test",
      };

      expect(() => buildParentString(unsupportedParent)).to.throw("Unsupported parent type");
    });
  });

  // Phase 3: buildProvisionRequest helper function tests
  describe("buildProvisionRequest", () => {
    it("should build basic request with minimal options", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.equal({
        appNamespace: WEB_APP_ID,
        displayName: PROJECT_DISPLAY_NAME,
        webInput: {},
      });
    });

    it("should include parent when specified", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: {
          displayName: PROJECT_DISPLAY_NAME,
          parent: { type: "existing_project", projectId: "my-project-123" },
        },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.include({
        appNamespace: WEB_APP_ID,
        displayName: PROJECT_DISPLAY_NAME,
        parent: "projects/my-project-123",
        webInput: {},
      });
    });

    it("should include location when specified", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
        features: { location: LOCATION },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.include({
        appNamespace: WEB_APP_ID,
        displayName: PROJECT_DISPLAY_NAME,
        location: LOCATION,
        webInput: {},
      });
    });

    it("should include requestId when specified", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
        requestId: REQUEST_ID,
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.include({
        appNamespace: WEB_APP_ID,
        displayName: PROJECT_DISPLAY_NAME,
        requestId: REQUEST_ID,
        webInput: {},
      });
    });

    it("should build iOS-specific request correctly", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.IOS,
          bundleId: BUNDLE_ID,
          appStoreId: "12345",
          teamId: "TEAM123",
        },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.equal({
        appNamespace: BUNDLE_ID,
        displayName: PROJECT_DISPLAY_NAME,
        appleInput: {
          appStoreId: "12345",
          teamId: "TEAM123",
        },
      });
    });

    it("should build Android-specific request correctly", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.ANDROID,
          packageName: PACKAGE_NAME,
          sha1Hashes: ["sha1hash1", "sha1hash2"],
          sha256Hashes: ["sha256hash1"],
        },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.equal({
        appNamespace: PACKAGE_NAME,
        displayName: PROJECT_DISPLAY_NAME,
        androidInput: {
          sha1Hashes: ["sha1hash1", "sha1hash2"],
          sha256Hashes: ["sha256hash1"],
        },
      });
    });

    it("should build Web-specific request correctly", () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.equal({
        appNamespace: WEB_APP_ID,
        displayName: PROJECT_DISPLAY_NAME,
        webInput: {},
      });
    });

    it("should include AI features when specified", () => {
      const aiFeatures = { enableAiLogic: true, model: "gemini-pro" };
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
        features: { firebaseAiLogicInput: aiFeatures },
      };

      const result = buildProvisionRequest(options);

      expect(result).to.deep.include({
        appNamespace: WEB_APP_ID,
        displayName: PROJECT_DISPLAY_NAME,
        firebaseAiLogicInput: aiFeatures,
        webInput: {},
      });
    });
  });

  // Phase 4: Main Function Success Cases
  describe("provisionFirebaseApp - Success Cases", () => {
    const mockResponse: ProvisionFirebaseAppResponse = {
      configMimeType: CONFIG_MIME_TYPE,
      configData: CONFIG_DATA,
      appResource: APP_RESOURCE,
    };

    it("should provision iOS app successfully", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.IOS, bundleId: BUNDLE_ID },
      };

      // Mock API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
      expect(pollOperationStub.calledOnce).to.be.true;
    });

    it("should provision Android app successfully", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.ANDROID, packageName: PACKAGE_NAME },
      };

      // Mock API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
      expect(pollOperationStub.calledOnce).to.be.true;
    });

    it("should provision Web app successfully", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      // Mock API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
      expect(pollOperationStub.calledOnce).to.be.true;
    });

    it("should provision with existing project parent", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: {
          displayName: PROJECT_DISPLAY_NAME,
          parent: { type: "existing_project", projectId: "parent-project-123" },
        },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      // Mock API call with parent verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.parent).to.equal("projects/parent-project-123");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with organization parent", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: {
          displayName: PROJECT_DISPLAY_NAME,
          parent: { type: "organization", organizationId: "987654321" },
        },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      // Mock API call with parent verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.parent).to.equal("organizations/987654321");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with folder parent", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: {
          displayName: PROJECT_DISPLAY_NAME,
          parent: { type: "folder", folderId: "123456789" },
        },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      // Mock API call with parent verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.parent).to.equal("folders/123456789");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with requestId for idempotency", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
        requestId: REQUEST_ID,
      };

      // Mock API call with requestId verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.requestId).to.equal(REQUEST_ID);
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with custom location", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
        features: { location: LOCATION },
      };

      // Mock API call with location verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.location).to.equal(LOCATION);
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with AI features enabled", async () => {
      const aiFeatures = { enableAiLogic: true, model: "gemini-pro" };
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
        features: { firebaseAiLogicInput: aiFeatures },
      };

      // Mock API call with AI features verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.firebaseAiLogicInput).to.deep.equal(aiFeatures);
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with all optional iOS fields", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.IOS,
          bundleId: BUNDLE_ID,
          appStoreId: "12345",
          teamId: "TEAM123",
        },
      };

      // Mock API call with iOS fields verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.appleInput).to.deep.equal({
            appStoreId: "12345",
            teamId: "TEAM123",
          });
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should provision with all optional Android fields", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.ANDROID,
          packageName: PACKAGE_NAME,
          sha1Hashes: ["sha1hash1", "sha1hash2"],
          sha256Hashes: ["sha256hash1"],
        },
      };

      // Mock API call with Android fields verification
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.androidInput).to.deep.equal({
            sha1Hashes: ["sha1hash1", "sha1hash2"],
            sha256Hashes: ["sha256hash1"],
          });
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });
  });

  // Phase 5: Request ID Behavior Tests
  describe("provisionFirebaseApp - Request ID Behavior", () => {
    const mockResponse: ProvisionFirebaseAppResponse = {
      configMimeType: CONFIG_MIME_TYPE,
      configData: CONFIG_DATA,
      appResource: APP_RESOURCE,
    };

    const baseOptions: ProvisionFirebaseAppOptions = {
      project: { displayName: PROJECT_DISPLAY_NAME },
      app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
    };

    it("should work without requestId (undefined)", async () => {
      const options = { ...baseOptions };
      // Explicitly ensure requestId is undefined
      expect(options.requestId).to.be.undefined;

      // Mock API call and verify requestId is NOT included in request
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body).to.not.have.property("requestId");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should work with empty requestId", async () => {
      const options: ProvisionFirebaseAppOptions = {
        ...baseOptions,
        requestId: "",
      };

      // Mock API call and verify empty requestId is NOT included in request
      // (empty string is falsy, so it gets filtered out by the implementation)
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body).to.not.have.property("requestId");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should work with valid requestId", async () => {
      const options: ProvisionFirebaseAppOptions = {
        ...baseOptions,
        requestId: REQUEST_ID,
      };

      // Mock API call and verify requestId is included in request
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.requestId).to.equal(REQUEST_ID);
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should pass requestId to API when provided", async () => {
      const customRequestId = "custom-request-12345";
      const options: ProvisionFirebaseAppOptions = {
        ...baseOptions,
        requestId: customRequestId,
      };

      let actualRequestBody: any;

      // Mock API call and capture request body
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, (uri, requestBody) => {
          actualRequestBody = requestBody;
          return { name: OPERATION_RESOURCE_NAME };
        });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      // Verify requestId was passed correctly
      expect(actualRequestBody.requestId).to.equal(customRequestId);
      expect(result).to.deep.equal(mockResponse);
    });

    it("should not include requestId in request when omitted", async () => {
      const options = { ...baseOptions };
      // Ensure no requestId property exists
      delete (options as any).requestId;

      let actualRequestBody: any;

      // Mock API call and capture request body
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, (uri, requestBody) => {
          actualRequestBody = requestBody;
          return { name: OPERATION_RESOURCE_NAME };
        });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      // Verify requestId property does not exist in request
      expect(actualRequestBody).to.not.have.property("requestId");
      expect(result).to.deep.equal(mockResponse);
    });
  });

  // Phase 6: Error Handling Tests
  describe("provisionFirebaseApp - Error Cases", () => {
    const baseOptions: ProvisionFirebaseAppOptions = {
      project: { displayName: PROJECT_DISPLAY_NAME },
      app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
    };

    it("should reject if API call fails with 404", async () => {
      // Mock API call failure
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(404, { error: { message: "Project not found" } });

      // Ensure polling is never called for API failures
      pollOperationStub.onFirstCall().throws("Polling should not be called on API failure");

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(pollOperationStub.notCalled).to.be.true;
      }
    });

    it("should reject if API call fails with 403", async () => {
      // Mock API call failure
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(403, { error: { message: "Permission denied" } });

      // Ensure polling is never called for API failures
      pollOperationStub.onFirstCall().throws("Polling should not be called on API failure");

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(pollOperationStub.notCalled).to.be.true;
      }
    });

    it("should reject if API call fails with 500", async () => {
      // Mock API call failure
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(500, { error: { message: "Internal server error" } });

      // Ensure polling is never called for API failures
      pollOperationStub.onFirstCall().throws("Polling should not be called on API failure");

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(pollOperationStub.notCalled).to.be.true;
      }
    });

    it("should reject if polling operation fails", async () => {
      // Mock successful API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling failure
      const pollingError = new Error("Polling operation failed");
      pollOperationStub.onFirstCall().rejects(pollingError);

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(error.message).to.include("Polling operation failed");
        expect(pollOperationStub.calledOnce).to.be.true;
      }
    });

    it("should reject if polling operation times out", async () => {
      // Mock successful API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling timeout
      const timeoutError = new Error("Operation timed out");
      timeoutError.name = "TIMEOUT";
      pollOperationStub.onFirstCall().rejects(timeoutError);

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(error.message).to.include("Operation timed out");
        expect(pollOperationStub.calledOnce).to.be.true;
      }
    });

    it("should wrap unknown errors properly", async () => {
      // Mock API call that throws unexpected error
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .replyWithError("Unexpected network error");

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(error.message).to.include("Failed to make request");
        expect(pollOperationStub.notCalled).to.be.true;
      }
    });

    it("should preserve original error information", async () => {
      const originalError = new Error("Original error message");
      originalError.name = "CustomError";
      (originalError as any).code = "CUSTOM_CODE";

      // Mock API call failure
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling failure with custom error
      pollOperationStub.onFirstCall().rejects(originalError);

      try {
        await provisionFirebaseApp(baseOptions);
        expect.fail("Expected function to throw");
      } catch (error: any) {
        expect(error).to.be.instanceOf(FirebaseError);
        expect(error.message).to.include("Failed to provision Firebase app");
        expect(error.message).to.include("Original error message");

        // Verify original error is preserved
        const firebaseError = error as FirebaseError;
        expect(firebaseError.original).to.equal(originalError);
        expect(firebaseError.exit).to.equal(2);
      }
    });
  });

  // Phase 7: Platform Validation Tests
  describe("Platform-Specific Validation", () => {
    const mockResponse: ProvisionFirebaseAppResponse = {
      configMimeType: CONFIG_MIME_TYPE,
      configData: CONFIG_DATA,
      appResource: APP_RESOURCE,
    };

    it("should require bundleId for iOS apps", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.IOS, bundleId: BUNDLE_ID },
      };

      // Mock API call to verify bundleId is included as appNamespace
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.appNamespace).to.equal(BUNDLE_ID);
          expect(body.appleInput).to.exist;
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should require packageName for Android apps", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.ANDROID, packageName: PACKAGE_NAME },
      };

      // Mock API call to verify packageName is included as appNamespace
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.appNamespace).to.equal(PACKAGE_NAME);
          expect(body.androidInput).to.exist;
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should require webAppId for Web apps", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
      };

      // Mock API call to verify webAppId is included as appNamespace
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.appNamespace).to.equal(WEB_APP_ID);
          expect(body.webInput).to.exist;
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should accept optional appStoreId for iOS", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.IOS,
          bundleId: BUNDLE_ID,
          appStoreId: "123456789",
        },
      };

      // Mock API call to verify appStoreId is included
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.appleInput.appStoreId).to.equal("123456789");
          expect(body.appleInput).to.not.have.property("teamId");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should accept optional teamId for iOS", async () => {
      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.IOS,
          bundleId: BUNDLE_ID,
          teamId: "TEAM123",
        },
      };

      // Mock API call to verify teamId is included
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.appleInput.teamId).to.equal("TEAM123");
          expect(body.appleInput).to.not.have.property("appStoreId");
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });

    it("should accept optional SHA hashes for Android", async () => {
      const sha1Hashes = ["sha1hash1", "sha1hash2"];
      const sha256Hashes = ["sha256hash1"];

      const options: ProvisionFirebaseAppOptions = {
        project: { displayName: PROJECT_DISPLAY_NAME },
        app: {
          platform: AppPlatform.ANDROID,
          packageName: PACKAGE_NAME,
          sha1Hashes,
          sha256Hashes,
        },
      };

      // Mock API call to verify SHA hashes are included
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp", (body) => {
          expect(body.androidInput).to.deep.equal({
            sha1Hashes,
            sha256Hashes,
          });
          return true;
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(options);

      expect(result).to.deep.equal(mockResponse);
    });
  });

  // Phase 8: API Integration Tests
  describe("API Integration", () => {
    const mockResponse: ProvisionFirebaseAppResponse = {
      configMimeType: CONFIG_MIME_TYPE,
      configData: CONFIG_DATA,
      appResource: APP_RESOURCE,
    };

    const baseOptions: ProvisionFirebaseAppOptions = {
      project: { displayName: PROJECT_DISPLAY_NAME },
      app: { platform: AppPlatform.WEB, webAppId: WEB_APP_ID },
    };

    it("should call correct API endpoint", async () => {
      let actualApiEndpoint: string | undefined;

      // Capture the API endpoint that was called
      nock(firebaseApiOrigin())
        .post((uri) => {
          actualApiEndpoint = uri;
          return uri === "/v1alpha/firebase:provisionFirebaseApp";
        })
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(baseOptions);

      expect(actualApiEndpoint).to.equal("/v1alpha/firebase:provisionFirebaseApp");
      expect(result).to.deep.equal(mockResponse);
    });

    it("should use correct API version (v1alpha)", async () => {
      // Mock the exact v1alpha endpoint
      const scope = nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(baseOptions);

      // Verify the exact endpoint was called
      expect(scope.isDone()).to.be.true;
      expect(result).to.deep.equal(mockResponse);
    });

    it("should poll with correct API version (v1beta1)", async () => {
      // Mock initial API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling - verify the polling call parameters
      pollOperationStub.onFirstCall().callsFake(async (options) => {
        expect(options.apiOrigin).to.equal(firebaseApiOrigin());
        expect(options.apiVersion).to.equal("v1beta1");
        expect(options.operationResourceName).to.equal(OPERATION_RESOURCE_NAME);
        expect(options.pollerName).to.equal("Provision Firebase App Poller");
        return mockResponse;
      });

      const result = await provisionFirebaseApp(baseOptions);

      expect(result).to.deep.equal(mockResponse);
      expect(pollOperationStub.calledOnce).to.be.true;
    });

    it("should pass correct request body structure", async () => {
      let actualRequestBody: any;

      // Capture and verify request body structure
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, (uri, requestBody) => {
          actualRequestBody = requestBody;
          return { name: OPERATION_RESOURCE_NAME };
        });

      // Mock polling
      pollOperationStub.onFirstCall().resolves(mockResponse);

      const result = await provisionFirebaseApp(baseOptions);

      // Verify request body has correct structure
      expect(actualRequestBody).to.have.property("appNamespace", WEB_APP_ID);
      expect(actualRequestBody).to.have.property("displayName", PROJECT_DISPLAY_NAME);
      expect(actualRequestBody).to.have.property("webInput");
      expect(actualRequestBody.webInput).to.deep.equal({});
      expect(result).to.deep.equal(mockResponse);
    });

    it("should handle LRO polling correctly", async () => {
      // Mock initial API call returning operation
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling with detailed verification
      pollOperationStub.onFirstCall().callsFake(async (options) => {
        // Verify all polling parameters are correct
        expect(options).to.deep.include({
          pollerName: "Provision Firebase App Poller",
          apiOrigin: firebaseApiOrigin(),
          apiVersion: "v1beta1",
          operationResourceName: OPERATION_RESOURCE_NAME,
        });

        // Simulate successful polling result
        return mockResponse;
      });

      const result = await provisionFirebaseApp(baseOptions);

      expect(result).to.deep.equal(mockResponse);
      expect(pollOperationStub.calledOnce).to.be.true;
    });

    it("should return correct response type", async () => {
      // Mock API call
      nock(firebaseApiOrigin())
        .post("/v1alpha/firebase:provisionFirebaseApp")
        .reply(200, { name: OPERATION_RESOURCE_NAME });

      // Mock polling with specific response structure
      const expectedResponse: ProvisionFirebaseAppResponse = {
        configMimeType: "application/json",
        configData: "eyJ0ZXN0IjoiZGF0YSJ9", // base64 encoded test data
        appResource: "projects/test-project-123/apps/web-app-456",
      };

      pollOperationStub.onFirstCall().resolves(expectedResponse);

      const result = await provisionFirebaseApp(baseOptions);

      // Verify the response structure and types
      expect(result).to.have.property("configMimeType");
      expect(result).to.have.property("configData");
      expect(result).to.have.property("appResource");
      expect(typeof result.configMimeType).to.equal("string");
      expect(typeof result.configData).to.equal("string");
      expect(typeof result.appResource).to.equal("string");
      expect(result).to.deep.equal(expectedResponse);
    });
  });
});
