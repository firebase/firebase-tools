import { expect } from "chai";
import * as sinon from "sinon";
import { Delegate } from "./index";
import * as discovery from "../discovery";
import * as build from "../../build";
import * as supported from "../supported";

describe("Dart Runtime Delegate", () => {
  describe("discoverBuild", () => {
    let detectFromYamlStub: sinon.SinonStub;

    beforeEach(() => {
      detectFromYamlStub = sinon.stub(discovery, "detectFromYaml");
    });

    afterEach(() => {
      sinon.restore();
    });

    it("should set default timeout to 60 if undefined", async () => {
      const delegate = new Delegate("project", "sourceDir", supported.latest("dart"));

      const mockBuild: build.Build = {
        endpoints: {
          func1: {
            platform: "gcfv2",
            entryPoint: "func1",
            project: "project",
            runtime: supported.latest("dart"),
            httpsTrigger: {},
          },
        },
        params: [],
        requiredAPIs: [],
      };

      detectFromYamlStub.resolves(mockBuild);

      const result = await delegate.discoverBuild({}, {});

      expect(result.endpoints.func1.timeoutSeconds).to.equal(60);
      expect(result.endpoints.func1.platform).to.equal("run");
    });

    it("should preserve user-defined timeout", async () => {
      const delegate = new Delegate("project", "sourceDir", supported.latest("dart"));

      const mockBuild: build.Build = {
        endpoints: {
          func1: {
            platform: "gcfv2",
            entryPoint: "func1",
            project: "project",
            runtime: supported.latest("dart"),
            httpsTrigger: {},
            timeoutSeconds: 120,
          },
        },
        params: [],
        requiredAPIs: [],
      };

      detectFromYamlStub.resolves(mockBuild);

      const result = await delegate.discoverBuild({}, {});

      expect(result.endpoints.func1.timeoutSeconds).to.equal(120);
      expect(result.endpoints.func1.platform).to.equal("run");
    });

    it("should not apply default timeout in emulator mode", async () => {
      const delegate = new Delegate("project", "sourceDir", supported.latest("dart"));

      const mockBuild: build.Build = {
        endpoints: {
          func1: {
            platform: "gcfv2",
            entryPoint: "func1",
            project: "project",
            runtime: supported.latest("dart"),
            httpsTrigger: {},
          },
        },
        params: [],
        requiredAPIs: [],
      };

      detectFromYamlStub.resolves(mockBuild);

      const result = await delegate.discoverBuild({}, { FUNCTIONS_EMULATOR: "true" });

      expect(result.endpoints.func1.timeoutSeconds).to.be.undefined;
      // Platform should not be converted to "run" in emulator mode either
      expect(result.endpoints.func1.platform).to.equal("gcfv2");
    });
  });
});
