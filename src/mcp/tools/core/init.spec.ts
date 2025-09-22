import { expect } from "chai";
import * as sinon from "sinon";
import { init, validateProvisioningInputs, buildProvisionOptionsFromMcpInputs } from "./init";
import * as initIndex from "../../../init/index";
import { FirebaseMcpServer } from "../../../mcp";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";
import { SupportedPlatform } from "./app-context";
import { AppPlatform } from "../../../management/apps";
import { MockProvisioningService } from "./mock-provision";
import * as configUtils from "./config-utils";
import * as appContext from "./app-context";
import * as fs from "fs-extra";

describe("init tool", () => {
  let sandbox: sinon.SinonSandbox;
  let actuateStub: sinon.SinonStub;
  let server: FirebaseMcpServer;
  let mockConfig: any;
  let mockRc: any;
  let mockContext: ServerToolContext;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    actuateStub = sandbox.stub(initIndex, "actuate").resolves();
    server = new FirebaseMcpServer({ projectRoot: "" });

    mockConfig = {
      src: {},
      writeProjectFile: sandbox.stub(),
    };

    mockRc = {
      data: {},
    };

    mockContext = {
      projectId: "test-project",
      accountEmail: "test@example.com",
      config: mockConfig,
      host: server,
      rc: mockRc,
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("validateProvisioningInputs", () => {
    it("should not validate when provisioning is not enabled", () => {
      expect(() => validateProvisioningInputs(undefined, {}, {})).to.not.throw();
      expect(() => validateProvisioningInputs({ enable: false }, {}, {})).to.not.throw();
    });

    it("should require app when provisioning is enabled", () => {
      expect(() => validateProvisioningInputs({ enable: true }, {}, undefined)).to.throw(
        "app is required when provisioning is enabled",
      );
    });

    it("should require platform when provisioning is enabled", () => {
      expect(() => validateProvisioningInputs({ enable: true }, {}, {})).to.throw(
        "app.platform is required when provisioning is enabled",
      );
    });

    it("should require bundle_id for iOS apps", () => {
      const app = { platform: "ios" as SupportedPlatform };
      expect(() => validateProvisioningInputs({ enable: true }, {}, app)).to.throw(
        "bundle_id is required for iOS apps",
      );
    });

    it("should require package_name for Android apps", () => {
      const app = { platform: "android" as SupportedPlatform };
      expect(() => validateProvisioningInputs({ enable: true }, {}, app)).to.throw(
        "package_name is required for Android apps",
      );
    });

    it("should require web_app_id for Web apps", () => {
      const app = { platform: "web" as SupportedPlatform };
      expect(() => validateProvisioningInputs({ enable: true }, {}, app)).to.throw(
        "web_app_id is required for Web apps",
      );
    });

    it("should validate valid iOS app configuration", () => {
      const app = { platform: "ios" as SupportedPlatform, bundleId: "com.example.app" };
      expect(() => validateProvisioningInputs({ enable: true }, {}, app)).to.not.throw();
    });

    it("should validate valid Android app configuration", () => {
      const app = { platform: "android" as SupportedPlatform, packageName: "com.example.app" };
      expect(() => validateProvisioningInputs({ enable: true }, {}, app)).to.not.throw();
    });

    it("should validate valid Web app configuration", () => {
      const app = { platform: "web" as SupportedPlatform, webAppId: "web-app-id" };
      expect(() => validateProvisioningInputs({ enable: true }, {}, app)).to.not.throw();
    });

    it("should validate parent resource format", () => {
      const app = { platform: "web" as SupportedPlatform, webAppId: "web-app-id" };

      expect(() =>
        validateProvisioningInputs({ enable: true }, { parent: "projects/my-project" }, app),
      ).to.not.throw();

      expect(() =>
        validateProvisioningInputs({ enable: true }, { parent: "folders/123456" }, app),
      ).to.not.throw();

      expect(() =>
        validateProvisioningInputs({ enable: true }, { parent: "organizations/789" }, app),
      ).to.not.throw();

      expect(() =>
        validateProvisioningInputs({ enable: true }, { parent: "invalid-format" }, app),
      ).to.throw("parent must be in format: 'projects/id', 'folders/id', or 'organizations/id'");
    });
  });

  describe("init tool execution", () => {
    it("should work with existing features (backward compatibility)", async () => {
      const features = {
        firestore: {
          database_id: "(default)",
          location_id: "nam5",
          rules_filename: "firestore.rules",
        },
      };

      const result = await init.fn({ features }, mockContext);

      expect(actuateStub.calledOnce).to.be.true;
      expect(mockConfig.writeProjectFile.calledTwice).to.be.true;
      expect(result).to.deep.equal(
        toContent("Successfully setup those features: firestore\n\nTo get started:\n\n- \n"),
      );
    });

    it("should work with ai_logic feature", async () => {
      const features = { ai_logic: true };

      const result = await init.fn({ features }, mockContext);

      expect(actuateStub.calledOnce).to.be.true;
      expect(mockConfig.writeProjectFile.calledTwice).to.be.true;
      expect(result).to.deep.equal(
        toContent("Successfully setup those features: ai_logic\n\nTo get started:\n\n- \n"),
      );
    });

    it("should handle provisioning parameters without error", async () => {
      const features = { ai_logic: true };
      const provisioning = { enable: true };
      const project = { display_name: "Test Project", location: "us-central1" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = await init.fn({ features, provisioning, project, app }, mockContext);

      expect(actuateStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(
        toContent("Successfully setup those features: ai_logic\n\nTo get started:\n\n- \n"),
      );
    });

    it("should throw validation error for invalid provisioning config", async () => {
      const features = {};
      const provisioning = { enable: true };

      try {
        await init.fn({ features, provisioning }, mockContext);
        expect.fail("Should have thrown an error");
      } catch (error: unknown) {
        expect((error as Error).message).to.equal("app is required when provisioning is enabled");
      }
    });

    it("should work with empty features object", async () => {
      const features = {};

      const result = await init.fn({ features }, mockContext);

      expect(actuateStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(
        toContent("Successfully setup those features: \n\nTo get started:\n\n- \n"),
      );
    });

    it("should handle multiple features including ai_logic", async () => {
      const features = {
        firestore: {
          database_id: "(default)",
          location_id: "nam5",
        },
        ai_logic: true,
      };

      const result = await init.fn({ features }, mockContext);

      expect(actuateStub.calledOnce).to.be.true;
      expect(result).to.deep.equal(
        toContent(
          "Successfully setup those features: firestore, ai_logic\n\nTo get started:\n\n- \n",
        ),
      );
    });
  });

  describe("buildProvisionOptionsFromMcpInputs", () => {
    it("should convert basic MCP inputs to provision format correctly", () => {
      const project = { display_name: "Test Project" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-web-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result).to.deep.equal({
        project: {
          displayName: "Test Project",
        },
        app: {
          platform: AppPlatform.WEB,
          webAppId: "test-web-app",
        },
      });
    });

    it("should handle iOS app with all optional fields", () => {
      const project = { display_name: "iOS Test Project", location: "us-central1" };
      const app = {
        platform: "ios" as SupportedPlatform,
        bundleId: "com.example.app",
        app_store_id: "123456789",
        team_id: "ABCD123456",
      };
      const features = { ai_logic: true };

      const result = buildProvisionOptionsFromMcpInputs(project, app, features);

      expect(result).to.deep.equal({
        project: {
          displayName: "iOS Test Project",
        },
        app: {
          platform: AppPlatform.IOS,
          bundleId: "com.example.app",
          appStoreId: "123456789",
          teamId: "ABCD123456",
        },
        features: {
          location: "us-central1",
          firebaseAiLogicInput: { enableAiLogic: true },
        },
      });
    });

    it("should handle Android app with SHA hashes", () => {
      const project = { display_name: "Android Test Project" };
      const app = {
        platform: "android" as SupportedPlatform,
        packageName: "com.example.androidapp",
        sha1_hashes: ["sha1hash1", "sha1hash2"],
        sha256_hashes: ["sha256hash1"],
      };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result).to.deep.equal({
        project: {
          displayName: "Android Test Project",
        },
        app: {
          platform: AppPlatform.ANDROID,
          packageName: "com.example.androidapp",
          sha1Hashes: ["sha1hash1", "sha1hash2"],
          sha256Hashes: ["sha256hash1"],
        },
      });
    });

    it("should handle parent resource parsing for existing project", () => {
      const project = {
        display_name: "Test Project",
        parent: "projects/existing-project-123",
      };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result.project.parent).to.deep.equal({
        type: "existing_project",
        projectId: "existing-project-123",
      });
    });

    it("should handle parent resource parsing for folder", () => {
      const project = {
        display_name: "Test Project",
        parent: "folders/123456789",
      };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result.project.parent).to.deep.equal({
        type: "folder",
        folderId: "123456789",
      });
    });

    it("should handle parent resource parsing for organization", () => {
      const project = {
        display_name: "Test Project",
        parent: "organizations/987654321",
      };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result.project.parent).to.deep.equal({
        type: "organization",
        organizationId: "987654321",
      });
    });

    it("should ignore invalid parent resource format", () => {
      const project = {
        display_name: "Test Project",
        parent: "invalid-format",
      };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result.project.parent).to.be.undefined;
    });

    it("should include only location when AI logic is not enabled", () => {
      const project = {
        display_name: "Test Project",
        location: "europe-west1",
      };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result.features).to.deep.equal({
        location: "europe-west1",
      });
    });

    it("should include only AI logic when location is not specified", () => {
      const project = { display_name: "Test Project" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };
      const features = { ai_logic: true };

      const result = buildProvisionOptionsFromMcpInputs(project, app, features);

      expect(result.features).to.deep.equal({
        firebaseAiLogicInput: { enableAiLogic: true },
      });
    });

    it("should not include features when neither location nor AI logic are specified", () => {
      const project = { display_name: "Test Project" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const result = buildProvisionOptionsFromMcpInputs(project, app);

      expect(result.features).to.be.undefined;
    });

    it("should throw error when project display_name is missing", () => {
      const project = {};
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      expect(() => buildProvisionOptionsFromMcpInputs(project, app)).to.throw(
        "Project display name and app platform are required for provisioning"
      );
    });

    it("should throw error when app platform is missing", () => {
      const project = { display_name: "Test Project" };
      const app = { webAppId: "test-app" };

      expect(() => buildProvisionOptionsFromMcpInputs(project, app)).to.throw(
        "Project display name and app platform are required for provisioning"
      );
    });

    it("should throw error when project is undefined", () => {
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      expect(() => buildProvisionOptionsFromMcpInputs(undefined, app)).to.throw(
        "Project display name and app platform are required for provisioning"
      );
    });

    it("should throw error when app is undefined", () => {
      const project = { display_name: "Test Project" };

      expect(() => buildProvisionOptionsFromMcpInputs(project, undefined)).to.throw(
        "Project display name and app platform are required for provisioning"
      );
    });

    it("should handle all platforms correctly", () => {
      const project = { display_name: "Multi Platform Project" };

      // Test iOS
      const iosApp = { platform: "ios" as SupportedPlatform, bundleId: "com.example.ios" };
      const iosResult = buildProvisionOptionsFromMcpInputs(project, iosApp);
      expect(iosResult.app.platform).to.equal(AppPlatform.IOS);

      // Test Android
      const androidApp = { platform: "android" as SupportedPlatform, packageName: "com.example.android" };
      const androidResult = buildProvisionOptionsFromMcpInputs(project, androidApp);
      expect(androidResult.app.platform).to.equal(AppPlatform.ANDROID);

      // Test Web
      const webApp = { platform: "web" as SupportedPlatform, webAppId: "web-app" };
      const webResult = buildProvisionOptionsFromMcpInputs(project, webApp);
      expect(webResult.app.platform).to.equal(AppPlatform.WEB);
    });
  });

  describe("End-to-End Provisioning Flow", () => {
    let mockProvisioningService: MockProvisioningService;
    let writeConfigFileStub: sinon.SinonStub;
    let updateFirebaseRCStub: sinon.SinonStub;
    let resolveAppContextStub: sinon.SinonStub;
    let createNewAppDirectoryStub: sinon.SinonStub;
    let handleConfigFileConflictStub: sinon.SinonStub;
    let fsExistsSyncStub: sinon.SinonStub;

    beforeEach(() => {
      mockProvisioningService = new MockProvisioningService();

      // Stub all the utility functions
      writeConfigFileStub = sandbox.stub(configUtils, "writeConfigFile").resolves();
      updateFirebaseRCStub = sandbox.stub(configUtils, "updateFirebaseRC");
      resolveAppContextStub = sandbox.stub(appContext, "resolveAppContext");
      createNewAppDirectoryStub = sandbox.stub(appContext, "createNewAppDirectory");
      handleConfigFileConflictStub = sandbox.stub(appContext, "handleConfigFileConflict");
      fsExistsSyncStub = sandbox.stub(fs, "existsSync");
    });

    it("should complete full provisioning flow for iOS app with new directory", async () => {
      const features = { ai_logic: true };
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      const project = { display_name: "Test iOS Project", location: "us-central1" };
      const app = { platform: "ios" as SupportedPlatform, bundleId: "com.example.test" };

      // Mock app context resolution - new directory needed
      const mockAppContext = {
        platform: "ios" as SupportedPlatform,
        directory: "/path/to/ios",
        configFilePath: "/path/to/ios/GoogleService-Info.plist",
        shouldCreateDirectory: true,
        bundleId: "com.example.test",
      };
      resolveAppContextStub.resolves(mockAppContext);

      // Mock directory creation
      const mockCreatedAppContext = {
        ...mockAppContext,
        shouldCreateDirectory: false,
      };
      createNewAppDirectoryStub.resolves(mockCreatedAppContext);

      // Mock .firebaserc with no existing project
      mockRc.data = {};

      const contextWithService = {
        ...mockContext,
        provisioningService: mockProvisioningService,
      };

      const result = await init.fn({ features, provisioning, project, app }, contextWithService);

      // Verify provisioning flow was executed
      expect(resolveAppContextStub.calledOnce).to.be.true;
      expect(resolveAppContextStub.calledWith(process.cwd(), app)).to.be.true;

      expect(createNewAppDirectoryStub.calledOnce).to.be.true;
      expect(createNewAppDirectoryStub.calledWith(process.cwd(), "ios", app)).to.be.true;

      expect(updateFirebaseRCStub.calledOnce).to.be.true;
      expect(updateFirebaseRCStub.firstCall.args[1]).to.equal("test-ios-project-abc123"); // Mock project ID

      expect(handleConfigFileConflictStub.calledOnce).to.be.true;
      expect(handleConfigFileConflictStub.calledWith(mockCreatedAppContext.configFilePath, false)).to.be.true;

      expect(writeConfigFileStub.calledOnce).to.be.true;
      expect(writeConfigFileStub.firstCall.args[0]).to.equal(mockCreatedAppContext.configFilePath);
      expect(writeConfigFileStub.firstCall.args[2]).to.equal("text/xml"); // iOS mime type

      // Verify feature setup continued normally
      expect(actuateStub.calledOnce).to.be.true;
      expect(result.content[0].text).to.include("Successfully setup those features: ai_logic");
    });

    it("should complete full provisioning flow for Android app with existing directory", async () => {
      const features = {};
      const provisioning = { enable: true, overwrite_project: true, overwrite_configs: true };
      const project = { display_name: "Android Test App" };
      const app = { platform: "android" as SupportedPlatform, packageName: "com.example.android" };

      // Mock app context resolution - existing directory
      const mockAppContext = {
        platform: "android" as SupportedPlatform,
        directory: "/path/to/existing/android",
        configFilePath: "/path/to/existing/android/google-services.json",
        shouldCreateDirectory: false,
        packageName: "com.example.android",
      };
      resolveAppContextStub.resolves(mockAppContext);

      // Mock .firebaserc with existing project
      mockRc.data = { projects: { default: "old-project" } };

      const contextWithService = {
        ...mockContext,
        provisioningService: mockProvisioningService,
      };

      const result = await init.fn({ features, provisioning, project, app }, contextWithService);

      // Verify no directory creation for existing app
      expect(createNewAppDirectoryStub.called).to.be.false;

      // Verify project overwrite
      expect(updateFirebaseRCStub.calledOnce).to.be.true;
      expect(updateFirebaseRCStub.calledWith(mockRc, "android-test-app-abc123", true)).to.be.true;

      // Verify config overwrite
      expect(handleConfigFileConflictStub.calledOnce).to.be.true;
      expect(handleConfigFileConflictStub.calledWith(mockAppContext.configFilePath, true)).to.be.true;

      expect(writeConfigFileStub.calledOnce).to.be.true;
      expect(writeConfigFileStub.firstCall.args[2]).to.equal("application/json"); // Android mime type

      expect(result.content[0].text).to.include("Successfully setup those features:");
    });

    it("should complete full provisioning flow for Web app with parent resource", async () => {
      const features = {};
      const provisioning = { enable: true };
      const project = {
        display_name: "Web Test Project",
        parent: "organizations/123456789",
        location: "europe-west1"
      };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-web-app-id" };

      // Mock app context resolution - new directory for web
      const mockAppContext = {
        platform: "web" as SupportedPlatform,
        directory: "/path/to/web",
        configFilePath: "/path/to/web/firebase-config.json",
        shouldCreateDirectory: true,
        webAppId: "test-web-app-id",
      };
      resolveAppContextStub.resolves(mockAppContext);

      const mockCreatedAppContext = {
        ...mockAppContext,
        shouldCreateDirectory: false,
      };
      createNewAppDirectoryStub.resolves(mockCreatedAppContext);

      mockRc.data = {};

      const contextWithService = {
        ...mockContext,
        provisioningService: mockProvisioningService,
      };

      const result = await init.fn({ features, provisioning, project, app }, contextWithService);

      // Verify directory creation
      expect(createNewAppDirectoryStub.calledOnce).to.be.true;

      // Verify project ID extraction and .firebaserc update
      expect(updateFirebaseRCStub.calledOnce).to.be.true;
      expect(updateFirebaseRCStub.firstCall.args[1]).to.equal("web-test-project-abc123");

      expect(writeConfigFileStub.calledOnce).to.be.true;
      expect(writeConfigFileStub.firstCall.args[2]).to.equal("application/json"); // Web mime type

      expect(result.content[0].text).to.include("Successfully setup those features:");
    });

    it("should handle provisioning errors gracefully", async () => {
      const features = {};
      const provisioning = { enable: true };
      const project = { display_name: "Error Test Project" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      // Mock provisioning service to throw error
      const failingService = {
        provisionFirebaseApp: sandbox.stub().rejects(new Error("API Error: Network timeout")),
      };

      const contextWithService = {
        ...mockContext,
        provisioningService: failingService,
      };

      try {
        await init.fn({ features, provisioning, project, app }, contextWithService);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Provisioning failed: API Error: Network timeout");
      }

      // Verify no side effects occurred
      expect(updateFirebaseRCStub.called).to.be.false;
      expect(writeConfigFileStub.called).to.be.false;
      expect(actuateStub.called).to.be.false;
    });

    it("should work without provisioning service (defaults to mock)", async () => {
      const features = {};
      const provisioning = { enable: true };
      const project = { display_name: "Default Mock Test" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      // Mock app context
      const mockAppContext = {
        platform: "web" as SupportedPlatform,
        directory: "/path/to/web",
        configFilePath: "/path/to/web/firebase-config.json",
        shouldCreateDirectory: true,
        webAppId: "test-app",
      };
      resolveAppContextStub.resolves(mockAppContext);
      createNewAppDirectoryStub.resolves({ ...mockAppContext, shouldCreateDirectory: false });

      // Context WITHOUT provisioning service - should default to mock
      mockRc.data = {};
      const contextWithoutService = {
        ...mockContext,
      };

      const result = await init.fn({ features, provisioning, project, app }, contextWithoutService);

      // Should still work with default mock service
      expect(updateFirebaseRCStub.calledOnce).to.be.true;
      expect(writeConfigFileStub.calledOnce).to.be.true;
      expect(result.content[0].text).to.include("Successfully setup those features:");
    });

    it("should skip provisioning when not enabled", async () => {
      const features = { firestore: { database_id: "(default)" } };
      const provisioning = { enable: false };
      const project = { display_name: "No Provision Test" };
      const app = { platform: "web" as SupportedPlatform, webAppId: "test-app" };

      const contextWithService = {
        ...mockContext,
        provisioningService: mockProvisioningService,
      };

      const result = await init.fn({ features, provisioning, project, app }, contextWithService);

      // Verify no provisioning occurred
      expect(resolveAppContextStub.called).to.be.false;
      expect(updateFirebaseRCStub.called).to.be.false;
      expect(writeConfigFileStub.called).to.be.false;

      // But normal feature setup should still work
      expect(actuateStub.calledOnce).to.be.true;
      expect(result.content[0].text).to.include("Successfully setup those features: firestore");
    });
  });
});
