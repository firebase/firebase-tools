import { expect } from "chai";

import * as configExport from "./runtimeConfigExport";
import * as env from "./env";
import * as sinon from "sinon";
import * as rc from "../rc";

describe("functions-config-export", () => {
  describe("getAllProjects", () => {
    let loadRCStub: sinon.SinonStub;

    beforeEach(() => {
      loadRCStub = sinon.stub(rc, "loadRC").returns({} as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    });

    afterEach(() => {
      loadRCStub.restore();
    });

    it("should include projectId from the options", () => {
      expect(configExport.getProjectInfos({ projectId: "project-0" })).to.have.deep.members([
        {
          projectId: "project-0",
        },
      ]);
    });

    it("should include project and its alias from firebaserc", () => {
      loadRCStub.returns({ projects: { dev: "project-0", prod: "project-1" } });
      expect(configExport.getProjectInfos({ projectId: "project-0" })).to.have.deep.members([
        {
          projectId: "project-0",
          alias: "dev",
        },
        {
          projectId: "project-1",
          alias: "prod",
        },
      ]);
    });
  });

  describe("convertKey", () => {
    it("should converts valid config key", () => {
      expect(configExport.convertKey("service.api.url", "")).to.be.equal("SERVICE_API_URL");
      expect(configExport.convertKey("foo-bar.car", "")).to.be.equal("FOO_BAR_CAR");
    });

    it("should throw error if conversion is invalid", () => {
      expect(() => {
        configExport.convertKey("1.api.url", "");
      }).to.throw();
      expect(() => {
        configExport.convertKey("x.google.env", "");
      }).to.throw();
      expect(() => {
        configExport.convertKey("k.service", "");
      }).to.throw();
    });

    it("should use prefix to fix invalid config keys", () => {
      expect(configExport.convertKey("1.api.url", "CONFIG_")).to.equal("CONFIG_1_API_URL");
      expect(configExport.convertKey("x.google.env", "CONFIG_")).to.equal("CONFIG_X_GOOGLE_ENV");
      expect(configExport.convertKey("k.service", "CONFIG_")).to.equal("CONFIG_K_SERVICE");
    });

    it("should throw error if prefix is invalid", () => {
      expect(() => {
        configExport.convertKey("1.api.url", "X_GOOGLE_");
      }).to.throw();
      expect(() => {
        configExport.convertKey("x.google.env", "FIREBASE_");
      }).to.throw();
      expect(() => {
        configExport.convertKey("k.service", "123_");
      }).to.throw();
    });
  });

  describe("configToEnv", () => {
    it("should convert valid functions config ", () => {
      const { success, errors } = configExport.configToEnv(
        { foo: { bar: "foobar" }, service: { api: { url: "foobar", name: "a service" } } },
        "",
      );
      expect(success).to.have.deep.members([
        { origKey: "service.api.url", newKey: "SERVICE_API_URL", value: "foobar" },
        { origKey: "service.api.name", newKey: "SERVICE_API_NAME", value: "a service" },
        { origKey: "foo.bar", newKey: "FOO_BAR", value: "foobar" },
      ]);
      expect(errors).to.be.empty;
    });

    it("should collect errors for invalid conversions", () => {
      const { success, errors } = configExport.configToEnv(
        { firebase: { name: "foobar" }, service: { api: { url: "foobar", name: "a service" } } },
        "",
      );
      expect(success).to.have.deep.members([
        { origKey: "service.api.url", newKey: "SERVICE_API_URL", value: "foobar" },
        { origKey: "service.api.name", newKey: "SERVICE_API_NAME", value: "a service" },
      ]);
      expect(errors).to.not.be.empty;
    });

    it("should use prefix to fix invalid keys", () => {
      const { success, errors } = configExport.configToEnv(
        { firebase: { name: "foobar" }, service: { api: { url: "foobar", name: "a service" } } },
        "CONFIG_",
      );
      expect(success).to.have.deep.members([
        { origKey: "service.api.url", newKey: "SERVICE_API_URL", value: "foobar" },
        { origKey: "service.api.name", newKey: "SERVICE_API_NAME", value: "a service" },
        { origKey: "firebase.name", newKey: "CONFIG_FIREBASE_NAME", value: "foobar" },
      ]);
      expect(errors).to.be.empty;
    });
  });

  describe("toDotenvFormat", () => {
    it("should produce valid dotenv file with keys", () => {
      const dotenv = configExport.toDotenvFormat([
        { origKey: "service.api.url", newKey: "SERVICE_API_URL", value: "hello" },
        { origKey: "service.api.name", newKey: "SERVICE_API_NAME", value: "world" },
      ]);
      const { envs, errors } = env.parse(dotenv);
      expect(envs).to.be.deep.equal({
        SERVICE_API_URL: "hello",
        SERVICE_API_NAME: "world",
      });
      expect(errors).to.be.empty;
    });

    it("should preserve newline characters", () => {
      const dotenv = configExport.toDotenvFormat([
        { origKey: "service.api.url", newKey: "SERVICE_API_URL", value: "hello\nthere\nworld" },
      ]);
      const { envs, errors } = env.parse(dotenv);
      expect(envs).to.be.deep.equal({
        SERVICE_API_URL: "hello\nthere\nworld",
      });
      expect(errors).to.be.empty;
    });
  });

  describe("isLikelySecret", () => {
    it("should detect definite secret patterns", () => {
      expect(configExport.isLikelySecret("api_key")).to.be.true;
      expect(configExport.isLikelySecret("api-key")).to.be.true;
      expect(configExport.isLikelySecret("API_KEY")).to.be.true;
      expect(configExport.isLikelySecret("secret")).to.be.true;
      expect(configExport.isLikelySecret("password")).to.be.true;
      expect(configExport.isLikelySecret("passwd")).to.be.true;
      expect(configExport.isLikelySecret("private_key")).to.be.true;
      expect(configExport.isLikelySecret("private-key")).to.be.true;
      expect(configExport.isLikelySecret("auth_token")).to.be.true;
      expect(configExport.isLikelySecret("access_token")).to.be.true;
      expect(configExport.isLikelySecret("client_auth")).to.be.true;
      expect(configExport.isLikelySecret("api_credential")).to.be.true;
    });

    it("should detect likely secret patterns", () => {
      expect(configExport.isLikelySecret("key")).to.be.true;
      expect(configExport.isLikelySecret("token")).to.be.true;
      expect(configExport.isLikelySecret("auth")).to.be.true;
      expect(configExport.isLikelySecret("credential")).to.be.true;
      expect(configExport.isLikelySecret("database_key")).to.be.true;
      expect(configExport.isLikelySecret("encryption_key")).to.be.true;
    });

    it("should not detect non-secrets", () => {
      expect(configExport.isLikelySecret("url")).to.be.false;
      expect(configExport.isLikelySecret("name")).to.be.false;
      expect(configExport.isLikelySecret("enabled")).to.be.false;
      expect(configExport.isLikelySecret("port")).to.be.false;
      expect(configExport.isLikelySecret("timeout")).to.be.false;
      expect(configExport.isLikelySecret("max_retries")).to.be.false;
    });
  });

  describe("analyzeConfig", () => {
    it("should categorize config keys correctly", () => {
      const config = {
        service: {
          api_key: "secret123",
          url: "https://example.com",
          password: "pass123",
        },
        database: {
          host: "localhost",
          token: "db-token",
        },
        settings: {
          enabled: true,
          max_retries: 3,
        },
      };

      const analysis = configExport.analyzeConfig(config);
      expect(analysis.definiteSecrets).to.include.members(["service.api_key", "service.password"]);
      expect(analysis.likelySecrets).to.include.members(["database.token"]);
      expect(analysis.regularConfigs).to.include.members([
        "service.url",
        "database.host",
        "settings.enabled",
        "settings.max_retries",
      ]);
    });

    it("should detect invalid keys", () => {
      const config = {
        "1invalid": "value",
        firebase: "reserved",
        valid_key: "value",
      };

      const analysis = configExport.analyzeConfig(config);
      expect(analysis.invalidKeys).to.have.length(2);
      expect(analysis.invalidKeys[0].originalKey).to.equal("1invalid");
      expect(analysis.invalidKeys[0].suggestedKey).to.equal("CONFIG_1INVALID");
      expect(analysis.invalidKeys[1].originalKey).to.equal("firebase");
      expect(analysis.invalidKeys[1].suggestedKey).to.equal("CONFIG_FIREBASE");
    });
  });

  describe("getEnhancedComment", () => {
    it("should add type hints", () => {
      expect(configExport.getEnhancedComment("enabled", "true")).to.include("[boolean]");
      expect(configExport.getEnhancedComment("port", "3000")).to.include("[number]");
      expect(configExport.getEnhancedComment("items", "a,b,c")).to.include("[possible list]");
    });

    it("should add secret warnings", () => {
      expect(configExport.getEnhancedComment("api_key", "secret123")).to.include(
        "⚠️ LIKELY SECRET",
      );
      expect(configExport.getEnhancedComment("password", "pass123")).to.include("⚠️ LIKELY SECRET");
    });

    it("should always include original key", () => {
      expect(configExport.getEnhancedComment("my.key", "value")).to.include("from my.key");
    });
  });

  describe("enhancedToDotenvFormat", () => {
    it("should separate secrets from regular configs", () => {
      const envs = [
        { origKey: "service.api_key", newKey: "SERVICE_API_KEY", value: "secret123" },
        { origKey: "service.url", newKey: "SERVICE_URL", value: "https://example.com" },
        { origKey: "auth.token", newKey: "AUTH_TOKEN", value: "token123" },
      ];

      const result = configExport.enhancedToDotenvFormat(envs);
      expect(result).to.include("=== SAFE CONFIGS ===");
      expect(result).to.include("=== REVIEW REQUIRED - LIKELY SECRETS ===");
      expect(result).to.include('SERVICE_URL="https://example.com"');
      expect(result).to.include("# SERVICE_API_KEY");
      expect(result).to.include("# AUTH_TOKEN");
    });

    it("should add instructions for secrets", () => {
      const envs = [{ origKey: "stripe.api_key", newKey: "STRIPE_API_KEY", value: "sk_test_123" }];

      const result = configExport.enhancedToDotenvFormat(envs);
      expect(result).to.include("Move these to 'firebase functions:secrets:set'");
      expect(result).to.include("firebase functions:secrets:set STRIPE_API_KEY");
    });

    it("should preserve header if provided", () => {
      const envs = [
        { origKey: "service.url", newKey: "SERVICE_URL", value: "https://example.com" },
      ];
      const header = "# Custom header";

      const result = configExport.enhancedToDotenvFormat(envs, header);
      expect(result).to.start.with("# Custom header");
    });
  });

  describe("validateConfigValues", () => {
    it("should warn about multiline values", () => {
      const pInfos = [
        {
          projectId: "test",
          envs: [{ origKey: "msg", newKey: "MSG", value: "line1\nline2" }],
        },
      ];

      const warnings = configExport.validateConfigValues(pInfos);
      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include("Contains newlines");
    });

    it("should warn about very long values", () => {
      const pInfos = [
        {
          projectId: "test",
          envs: [{ origKey: "data", newKey: "DATA", value: "x".repeat(1001) }],
        },
      ];

      const warnings = configExport.validateConfigValues(pInfos);
      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include("Very long value");
    });

    it("should warn about empty values", () => {
      const pInfos = [
        {
          projectId: "test",
          envs: [{ origKey: "empty", newKey: "EMPTY", value: "" }],
        },
      ];

      const warnings = configExport.validateConfigValues(pInfos);
      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include("Empty value");
    });
  });

  describe("getValueForKey", () => {
    it("should get nested values", () => {
      const config = {
        service: {
          api: {
            url: "https://example.com",
          },
        },
      };

      expect(configExport.getValueForKey(config, "service.api.url")).to.equal(
        "https://example.com",
      );
    });

    it("should return undefined for missing keys", () => {
      const config = { service: {} };
      expect(configExport.getValueForKey(config, "service.missing.key")).to.be.undefined;
    });
  });

  describe("buildCategorizedConfigs", () => {
    it("should build categorized config objects", () => {
      const config = {
        service: {
          api_key: "secret123",
          url: "https://example.com",
        },
        auth: {
          token: "token123",
        },
      };

      const analysis = {
        definiteSecrets: ["service.api_key"],
        likelySecrets: ["auth.token"],
        regularConfigs: ["service.url"],
        invalidKeys: [],
      };

      const result = configExport.buildCategorizedConfigs(config, analysis);
      expect(result.definiteSecrets).to.deep.equal({ "service.api_key": "secret123" });
      expect(result.likelySecrets).to.deep.equal({ "auth.token": "token123" });
      expect(result.regularConfigs).to.deep.equal({ "service.url": "https://example.com" });
    });
  });
});
