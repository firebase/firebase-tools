import { expect } from "chai";
import * as sinon from "sinon";
import { init, validateProvisioningInputs } from "./init";
import * as initIndex from "../../../init/index";
import { FirebaseMcpServer } from "../../../mcp";
import { toContent } from "../../util";
import { ServerToolContext } from "../../tool";
import { SupportedPlatform } from "./app-context";

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
});
