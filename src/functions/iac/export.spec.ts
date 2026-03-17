import { expect } from "chai";
import * as sinon from "sinon";
import * as yaml from "js-yaml";

import * as exportIac from "./export";
import * as runtimes from "../../deploy/functions/runtimes";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as functionsConfig from "../../functionsConfig";
import * as functionsEnv from "../../functions/env";
import * as projectUtils from "../../projectUtils";
import * as projectConfig from "../projectConfig";
describe("export", () => {
  let needProjectIdStub: sinon.SinonStub;

  const mockDelegate = {
    language: "nodejs",
    runtime: "nodejs18",
    validate: sinon.stub(),
    build: sinon.stub(),
    discoverBuild: sinon.stub(),
  };

  beforeEach(() => {
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsEnv, "loadFirebaseEnvs").returns({});
    sinon.stub(runtimes, "getRuntimeDelegate").resolves(mockDelegate as any);
    sinon.stub(supported, "guardVersionSupport");
    needProjectIdStub = sinon.stub(projectUtils, "needProjectId").returns("my-project");
  });

  afterEach(() => {
    sinon.restore();
    mockDelegate.validate.reset();
    mockDelegate.build.reset();
    mockDelegate.discoverBuild.reset();
  });

  describe("getInternalIac", () => {
    it("should return functions.yaml with discovered build", async () => {
      const mockBuild = { endpoints: { "my-func": { platform: "gcfv1" } } };
      mockDelegate.discoverBuild.resolves(mockBuild);

      const options = { config: { path: (s: string) => s, projectDir: "dir" } };
<<<<<<< HEAD
      const codebase: Partial<projectConfig.ValidatedSingle> = { source: "src", runtime: "nodejs18" };
=======
      const codebase: projectConfig.ValidatedSingle = { source: "src", codebase: "default", runtime: "nodejs18" };
>>>>>>> 68fa701a9 (PR feedback)

      const result = await exportIac.getInternalIac(options, codebase);

      expect(needProjectIdStub.calledOnce).to.be.true;
      expect(mockDelegate.validate.calledOnce).to.be.true;
      expect(mockDelegate.build.calledOnce).to.be.true;
      expect(mockDelegate.discoverBuild.calledOnce).to.be.true;
      expect(result).to.deep.equal({
        "functions.yaml": yaml.dump(mockBuild),
      });
    });
  });

  describe("getTerraformIac", () => {
    it("should return variables.tf and main.tf with generated terraform", async () => {
      const mockBuild = {
        endpoints: {
          "my-func": {
            platform: "gcfv1",
            id: "my-func",
            region: ["us-central1"],
            entryPoint: "myFunc",
            runtime: "nodejs18",
            httpsTrigger: {},
          },
          "ignored-func": {
            platform: "gcfv2", // Should be ignored
          },
        },
      };
      mockDelegate.discoverBuild.resolves(mockBuild);

      const options = { config: { path: (s: string) => s, projectDir: "dir" } };
      const codebase: projectConfig.ValidatedSingle = { source: "src", codebase: "default", runtime: "nodejs18" };

      const result = await exportIac.getTerraformIac(options, codebase);

      expect(result["variables.tf"]).to.be.a("string");
      expect(result["main.tf"]).to.be.a("string");

      const mainTf = result["main.tf"];
      expect(mainTf).to.include('resource "google_cloudfunctions_function" "my_func"');
      expect(mainTf).to.include('resource "google_cloudfunctions_function_iam_binding" "my_func"');
      expect(mainTf).to.not.include("ignored-func");
    });
  });
});
