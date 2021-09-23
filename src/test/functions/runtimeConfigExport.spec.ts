import { expect } from "chai";

import * as configExport from "../../../src/functions/runtimeConfigExport";
import * as env from "../../../src/functions/env";
import * as sinon from "sinon";
import * as rc from "../../rc";

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

  describe("flatten", () => {
    it("should flatten simple objects", () => {
      expect(configExport.flatten({ foo: "foo", bar: "bar" })).to.be.deep.equal({
        foo: "foo",
        bar: "bar",
      });
    });
    it("should flatten deeply nested objects", () => {
      expect(configExport.flatten({ foo: "foo", a: { aa: { aaa: "a" } } })).to.be.deep.equal({
        foo: "foo",
        ["a.aa.aaa"]: "a",
      });
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
        ""
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
        ""
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
        "CONFIG_"
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
        { origKey: "service.api.url", newKey: "SERVICE_API_URL", value: "hello\nworld" },
      ]);
      const { envs, errors } = env.parse(dotenv);
      expect(envs).to.be.deep.equal({
        SERVICE_API_URL: "hello\nworld",
      });
      expect(errors).to.be.empty;
    });
  });

  describe("generateDotenvFilename", () => {
    it("should generate dotenv filename using project alias", () => {
      expect(
        configExport.generateDotenvFilename({ projectId: "my-project", alias: "prod" })
      ).to.equal(".env.prod");
    });

    it("should generate dotenv filename using project id if alias doesn't exist", () => {
      expect(configExport.generateDotenvFilename({ projectId: "my-project" })).to.equal(
        ".env.my-project"
      );
    });
  });
});
