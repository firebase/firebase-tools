import { expect } from "chai";
import * as sinon from "sinon";
import { validateProvisioningInputs, buildProvisionOptions, init } from "./init";
import { AppPlatform } from "../../../management/apps";
import { McpContext } from "../../types";
import { Config } from "../../../config";
import { RC } from "../../../rc";

describe("init", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("validateProvisioningInputs", () => {
    it("should not validate when provisioning is disabled", () => {
      expect(() => validateProvisioningInputs()).to.not.throw();
      expect(() =>
        validateProvisioningInputs({
          enable: false,
          overwrite_project: false,
          overwrite_configs: false,
        }),
      ).to.not.throw();
    });

    it("should throw error when provisioning enabled but no app", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      expect(() => validateProvisioningInputs(provisioning)).to.throw(
        "app is required when provisioning is enabled",
      );
    });

    it("should throw error when app platform missing", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const app = {} as any;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      expect(() => validateProvisioningInputs(provisioning, undefined, app)).to.throw(
        "app.platform is required when provisioning is enabled",
      );
    });

    it("should throw error for iOS without bundle_id", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      const app = { platform: "ios" as const };
      expect(() => validateProvisioningInputs(provisioning, undefined, app)).to.throw(
        "bundle_id is required for iOS apps",
      );
    });

    it("should throw error for Android without package_name", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      const app = { platform: "android" as const };
      expect(() => validateProvisioningInputs(provisioning, undefined, app)).to.throw(
        "package_name is required for Android apps",
      );
    });

    it("should throw error for Web without web_app_id", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      const app = { platform: "web" as const };
      expect(() => validateProvisioningInputs(provisioning, undefined, app)).to.throw(
        "web_app_id is required for Web apps",
      );
    });

    it("should validate valid parent formats", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      const app = { platform: "ios" as const, bundle_id: "com.example.app" };

      const validParents = ["projects/my-project", "folders/123456789", "organizations/org-id"];

      validParents.forEach((parent) => {
        const project = { parent };
        expect(() => validateProvisioningInputs(provisioning, project, app)).to.not.throw();
      });
    });

    it("should throw error for invalid parent format", () => {
      const provisioning = { enable: true, overwrite_project: false, overwrite_configs: false };
      const app = { platform: "ios" as const, bundle_id: "com.example.app" };
      const project = { parent: "invalid-format" };

      expect(() => validateProvisioningInputs(provisioning, project, app)).to.throw(
        "parent must be in format: 'projects/id', 'folders/id', or 'organizations/id'",
      );
    });
  });

  describe("buildProvisionOptions", () => {
    it("should throw error when app platform missing", () => {
      expect(() => buildProvisionOptions()).to.throw("App platform is required for provisioning");
    });

    it("should build correct options for iOS app", () => {
      const project = { display_name: "Test Project", location: "us-central1" };
      const app = {
        platform: "ios" as const,
        bundle_id: "com.example.app",
        app_store_id: "123456789",
        team_id: "TEAMID123",
      };

      const result = buildProvisionOptions(project, app);

      expect(result).to.deep.equal({
        project: {
          displayName: "Test Project",
        },
        app: {
          platform: AppPlatform.IOS,
          bundleId: "com.example.app",
          appStoreId: "123456789",
          teamId: "TEAMID123",
        },
        features: {
          location: "us-central1",
        },
      });
    });

    it("should throw error for iOS without bundle_id", () => {
      const app = { platform: "ios" as const };
      expect(() => buildProvisionOptions(undefined, app)).to.throw(
        "bundle_id is required for iOS apps",
      );
    });

    it("should build correct options for Android app", () => {
      const app = {
        platform: "android" as const,
        package_name: "com.example.app",
        sha1_hashes: ["sha1hash"],
        sha256_hashes: ["sha256hash"],
      };

      const result = buildProvisionOptions(undefined, app);

      expect(result).to.deep.equal({
        project: {
          displayName: "Firebase Project",
        },
        app: {
          platform: AppPlatform.ANDROID,
          packageName: "com.example.app",
          sha1Hashes: ["sha1hash"],
          sha256Hashes: ["sha256hash"],
        },
      });
    });

    it("should throw error for Android without package_name", () => {
      const app = { platform: "android" as const };
      expect(() => buildProvisionOptions(undefined, app)).to.throw(
        "package_name is required for Android apps",
      );
    });

    it("should build correct options for Web app", () => {
      const app = {
        platform: "web" as const,
        web_app_id: "web-app-123",
      };

      const result = buildProvisionOptions(undefined, app);

      expect(result).to.deep.equal({
        project: {
          displayName: "Firebase Project",
        },
        app: {
          platform: AppPlatform.WEB,
          webAppId: "web-app-123",
        },
      });
    });

    it("should throw error for Web without web_app_id", () => {
      const app = { platform: "web" as const };
      expect(() => buildProvisionOptions(undefined, app)).to.throw(
        "web_app_id is required for Web apps",
      );
    });

    it("should handle parent resource parsing", () => {
      const project = { parent: "projects/existing-project" };
      const app = { platform: "ios" as const, bundle_id: "com.example.app" };

      const result = buildProvisionOptions(project, app);

      expect(result.project.parent).to.deep.equal({
        type: "existing_project",
        projectId: "existing-project",
      });
    });

    it("should handle folder parent", () => {
      const project = { parent: "folders/123456789" };
      const app = { platform: "ios" as const, bundle_id: "com.example.app" };

      const result = buildProvisionOptions(project, app);

      expect(result.project.parent).to.deep.equal({
        type: "folder",
        folderId: "123456789",
      });
    });

    it("should handle organization parent", () => {
      const project = { parent: "organizations/org-id" };
      const app = { platform: "ios" as const, bundle_id: "com.example.app" };

      const result = buildProvisionOptions(project, app);

      expect(result.project.parent).to.deep.equal({
        type: "organization",
        organizationId: "org-id",
      });
    });

    it("should add AI Logic feature when requested", () => {
      const app = { platform: "ios" as const, bundle_id: "com.example.app" };
      const features = { ai_logic: true };

      const result = buildProvisionOptions(undefined, app, features);

      expect(result.features?.firebaseAiLogicInput).to.deep.equal({});
    });
  });

  describe("init tool", () => {
    let actuateStub: sinon.SinonStub;
    let requireGeminiStub: sinon.SinonStub;

    let mockConfig: Partial<Config>;
    let mockRc: Partial<RC>;
    let mockContext: Partial<McpContext>;

    beforeEach(async () => {
      // Use dynamic imports to avoid require warnings
      const initModule = await import("../../../init/index");
      const errorsModule = await import("../../errors");
      const globModule = await import("glob");

      actuateStub = sandbox.stub(initModule, "actuate").resolves();
      requireGeminiStub = sandbox.stub(errorsModule, "requireGeminiToS").resolves();

      // Mock glob function since resolveAppContext uses it internally
      sandbox.stub(globModule, "glob").resolves([]);

      // Setup mock config
      mockConfig = {
        projectDir: "/test/project",
        src: { projects: {} },
        writeProjectFile: sandbox.stub(),
      } as Partial<Config>;

      // Setup mock rc
      mockRc = {
        data: { projects: {} },
      } as Partial<RC>;

      // Setup mock context
      mockContext = {
        projectId: "test-project",
        accountEmail: null,
        config: mockConfig as Config,
        rc: mockRc as RC,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        host: {} as any,
      };
    });

    it("should initialize Firestore feature without provisioning", async () => {
      const features = {
        firestore: {
          database_id: "test-db",
          location_id: "us-central1",
          rules_filename: "firestore.rules",
          rules: "rules_version = '2';",
        },
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(actuateStub).to.have.been.calledOnce;
      expect(result.content[0].text).to.include("Successfully setup those features: firestore");
    });

    it("should initialize Database feature without provisioning", async () => {
      const features = {
        database: {
          rules_filename: "database.rules.json",
          rules: '{"rules": {".read": "auth != null", ".write": "auth != null"}}',
        },
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(actuateStub).to.have.been.calledOnce;
      expect(result.content[0].text).to.include("Successfully setup those features: database");
    });

    it("should initialize Data Connect feature without provisioning", async () => {
      const features = {
        dataconnect: {
          service_id: "test-service",
          location_id: "us-central1",
          cloudsql_instance_id: "test-instance",
          cloudsql_database: "testdb",
          provision_cloudsql: false,
        },
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(actuateStub).to.have.been.calledOnce;
      expect(result.content[0].text).to.include("Successfully setup those features: dataconnect");
    });

    it("should check Gemini ToS for Data Connect with app description", async () => {
      const features = {
        dataconnect: {
          app_description: "A test app for data connect",
        },
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(requireGeminiStub).to.have.been.calledWith("test-project");
      expect(result.content[0].text).to.include("Successfully setup those features: dataconnect");
    });

    it("should return error if Gemini ToS check fails", async () => {
      const features = {
        dataconnect: {
          app_description: "A test app",
        },
      };

      const geminiError = { error: "Gemini ToS not accepted" };
      requireGeminiStub.resolves(geminiError);

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(result).to.equal(geminiError);
    });

    it("should initialize Storage feature without provisioning", async () => {
      const features = {
        storage: {
          rules_filename: "storage.rules",
          rules: "rules_version = '2';",
        },
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(actuateStub).to.have.been.calledOnce;
      expect(result.content[0].text).to.include("Successfully setup those features");
    });

    it("should initialize AI Logic feature without provisioning", async () => {
      const features = {
        ai_logic: true,
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(actuateStub).to.have.been.calledOnce;
      expect(result.content[0].text).to.include("Successfully setup those features: ailogic");
    });

    it("should handle validation errors for provisioning", async () => {
      const provisioning = { enable: true };
      const features = { firestore: {} };

      try {
        await init.fn({ provisioning, features }, mockContext as McpContext);
        expect.fail("Should have thrown error");
      } catch (error) {
        expect((error as Error).message).to.include("app is required when provisioning is enabled");
      }
    });

    it("should initialize multiple features together", async () => {
      const features = {
        firestore: { database_id: "test-db" },
        database: { rules_filename: "database.rules.json" },
        ai_logic: true,
      };

      const result = await init.fn({ features }, mockContext as McpContext);

      expect(result.content[0].text).to.include("firestore");
      expect(result.content[0].text).to.include("database");
      expect(result.content[0].text).to.include("ailogic");
    });

    it("should exist and be a tool object", () => {
      expect(init).to.be.an("object");
      expect(init.mcp.name).to.equal("init");
      expect(init.mcp.description).to.be.a("string");
    });

    describe("provisioning behaviors", () => {
      let provisionFirebaseAppStub: sinon.SinonStub;
      let fsExistsSyncStub: sinon.SinonStub;
      let writeAppConfigFileStub: sinon.SinonStub;
      let extractProjectIdStub: sinon.SinonStub;
      let appsModule: typeof import("../../../management/apps");

      beforeEach(async () => {
        // Use dynamic imports to avoid require warnings
        const provisionModule = await import("../../../management/provision");
        const fsModule = await import("fs-extra");
        const utilsModule = await import("./utils");
        appsModule = await import("../../../management/apps");

        provisionFirebaseAppStub = sandbox.stub(provisionModule, "provisionFirebaseApp");

        // Mock the internal functions from utils
        fsExistsSyncStub = sandbox.stub(fsModule, "existsSync");
        writeAppConfigFileStub = sandbox.stub(utilsModule, "writeAppConfigFile");
        extractProjectIdStub = sandbox.stub(utilsModule, "extractProjectIdFromAppResource");

        // Mock utility functions used internally
        sandbox.stub(utilsModule, "generateUniqueAppDirectoryName").returns("ios");
        sandbox
          .stub(utilsModule, "getFirebaseConfigFilePath")
          .returns("/test/project/ios/GoogleService-Info.plist");
        sandbox.stub(utilsModule, "findExistingIosApp").resolves(undefined);
        sandbox.stub(utilsModule, "findExistingAndroidApp").resolves(undefined);
      });

      it("should throw error when project already exists without overwrite_project", async () => {
        const provisioning = { enable: true, overwrite_project: false };
        const project = { parent: "projects/new-project" };
        const app = { platform: "ios" as const, bundle_id: "com.example.app" };
        const features = { firestore: {} };

        // Mock existing project ID
        const contextWithProject = {
          ...mockContext,
          projectId: "existing-project",
        };

        try {
          await init.fn({ provisioning, project, app, features }, contextWithProject as McpContext);
          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as Error).message).to.include("Project already configured in .firebaserc");
          expect((error as Error).message).to.include("overwrite_project: true");
        }
      });

      it("should allow project overwrite when overwrite_project is true", async () => {
        const provisioning = { enable: true, overwrite_project: true };
        const project = { parent: "projects/new-project" };
        const app = { platform: "ios" as const, bundle_id: "com.example.app" };
        const features = { firestore: {} };

        fsExistsSyncStub.returns(false);
        provisionFirebaseAppStub.resolves({
          appResource: "projects/new-project/apps/123456789",
          configData: "config-data-base64",
        });
        extractProjectIdStub.returns("new-project");

        const contextWithProject = {
          ...mockContext,
          projectId: "existing-project",
        };

        const result = await init.fn(
          { provisioning, project, app, features },
          contextWithProject as McpContext,
        );

        expect(provisionFirebaseAppStub).to.have.been.calledOnce;
        expect(result.content[0].text).to.include("Successfully setup those features");
      });

      it("should throw error when config file exists without overwrite_configs", async () => {
        const provisioning = { enable: true, overwrite_configs: false };
        const app = { platform: "ios" as const, bundle_id: "com.example.app" };
        const features = { firestore: {} };

        fsExistsSyncStub.returns(true); // Config file exists

        try {
          await init.fn({ provisioning, app, features }, mockContext as McpContext);
          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as Error).message).to.include("Config file");
          expect((error as Error).message).to.include("already exists");
          expect((error as Error).message).to.include("overwrite_configs: true");
        }
      });

      it("should allow config file overwrite when overwrite_configs is true", async () => {
        const provisioning = { enable: true, overwrite_configs: true };
        const app = { platform: "ios" as const, bundle_id: "com.example.app" };
        const features = { firestore: {} };

        fsExistsSyncStub.returns(true); // Config file exists
        provisionFirebaseAppStub.resolves({
          appResource: "projects/test-project/apps/123456789",
          configData: "config-data-base64",
        });
        extractProjectIdStub.returns("test-project");

        const result = await init.fn({ provisioning, app, features }, mockContext as McpContext);

        expect(writeAppConfigFileStub).to.have.been.calledWith(
          "/test/project/ios/GoogleService-Info.plist",
          "config-data-base64",
        );
        expect(result.content[0].text).to.include("Successfully setup those features");
      });

      it("should use active project when no parent is specified", async () => {
        const provisioning = { enable: true };
        const app = { platform: "ios" as const, bundle_id: "com.example.app" };
        const features = { firestore: {} };

        fsExistsSyncStub.returns(false);
        provisionFirebaseAppStub.resolves({
          appResource: "projects/test-project/apps/123456789",
          configData: "config-data-base64",
        });
        extractProjectIdStub.returns("test-project");

        await init.fn({ provisioning, app, features }, mockContext as McpContext);

        // Should call provisionFirebaseApp with project parent set to active project
        expect(provisionFirebaseAppStub).to.have.been.calledWith(
          sinon.match({
            project: sinon.match({
              parent: { type: "existing_project", projectId: "test-project" },
            }),
          }),
        );
      });

      it("should handle full provisioning flow with Android app", async () => {
        const provisioning = { enable: true };
        const project = { display_name: "My Firebase Project" };
        const app = {
          platform: "android" as const,
          package_name: "com.example.android",
          sha1_hashes: ["sha1hash"],
        };
        const features = { firestore: {}, database: {} };

        // Note: getFirebaseConfigFilePath is already stubbed in beforeEach

        fsExistsSyncStub.returns(false);
        provisionFirebaseAppStub.resolves({
          appResource: "projects/provisioned-project/apps/987654321",
          configData: "android-config-base64",
        });
        extractProjectIdStub.returns("provisioned-project");

        const result = await init.fn(
          { provisioning, project, app, features },
          mockContext as McpContext,
        );

        // Verify provisioning was called with correct options
        expect(provisionFirebaseAppStub).to.have.been.calledWith(
          sinon.match({
            project: sinon.match({
              displayName: "My Firebase Project",
              parent: { type: "existing_project", projectId: "test-project" },
            }),
            app: sinon.match({
              platform: appsModule.AppPlatform.ANDROID,
              packageName: "com.example.android",
              sha1Hashes: ["sha1hash"],
            }),
          }),
        );

        // Verify config file was written
        expect(writeAppConfigFileStub).to.have.been.called;

        // Verify project ID was extracted and used
        expect(extractProjectIdStub).to.have.been.calledWith(
          "projects/provisioned-project/apps/987654321",
        );

        expect(result.content[0].text).to.include("Successfully setup those features");
        expect(result.content[0].text).to.include("firestore");
        expect(result.content[0].text).to.include("database");
      });

      it("should handle provisioning errors gracefully", async () => {
        const provisioning = { enable: true };
        const app = { platform: "web" as const, web_app_id: "my-web-app" };
        const features = { firestore: {} };

        fsExistsSyncStub.returns(false);
        provisionFirebaseAppStub.rejects(new Error("API quota exceeded"));

        try {
          await init.fn({ provisioning, app, features }, mockContext as McpContext);
          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as Error).message).to.include("Provisioning failed");
          expect((error as Error).message).to.include("API quota exceeded");
        }
      });

      it("should update Firebase RC with provisioned project ID", async () => {
        const provisioning = { enable: true };
        const app = { platform: "web" as const, web_app_id: "my-web-app" };
        const features = { firestore: {} };

        fsExistsSyncStub.returns(false);
        provisionFirebaseAppStub.resolves({
          appResource: "projects/new-provisioned-project/apps/web-app-123",
          configData: "web-config-base64",
        });
        extractProjectIdStub.returns("new-provisioned-project");

        const testRc = {
          data: {
            projects: { default: "old-project" },
            targets: {},
            etags: {},
          },
        } as unknown as RC;
        const contextWithRc = {
          ...mockContext,
          rc: testRc,
        };

        await init.fn({ provisioning, app, features }, contextWithRc as McpContext);

        // Verify Firebase RC was updated with new project ID
        expect(testRc.data?.projects.default).to.equal("new-provisioned-project");
      });

      it("should handle provisioning with AI Logic feature", async () => {
        const provisioning = { enable: true };
        const project = { location: "us-central1" };
        const app = { platform: "ios" as const, bundle_id: "com.example.aiapp" };
        const features = { ai_logic: true };

        fsExistsSyncStub.returns(false);
        provisionFirebaseAppStub.resolves({
          appResource: "projects/ai-project/apps/123456789",
          configData: "ai-config-base64",
        });
        extractProjectIdStub.returns("ai-project");

        const result = await init.fn(
          { provisioning, project, app, features },
          mockContext as McpContext,
        );

        // Verify provisioning was called with AI Logic feature
        expect(provisionFirebaseAppStub).to.have.been.calledWith(
          sinon.match({
            features: sinon.match({
              location: "us-central1",
              firebaseAiLogicInput: {},
            }),
          }),
        );

        expect(result.content[0].text).to.include("ailogic");
      });
    });
  });
});
