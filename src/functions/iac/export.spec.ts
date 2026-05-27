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
    runtime: supported.latest("nodejs"),
    validate: sinon.stub(),
    build: sinon.stub(),
    discoverBuild: sinon.stub(),
    bin: "node",
    watch: sinon.stub(),
  } as const;

  beforeEach(() => {
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsEnv, "loadFirebaseEnvs").returns({});
    sinon.stub(runtimes, "getRuntimeDelegate").resolves(mockDelegate);
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
      const codebase: projectConfig.ValidatedSingle = {
        source: "src",
        codebase: "default",
        runtime: supported.latest("nodejs") as supported.ActiveRuntime,
      };

      const result = await exportIac.getInternalIac(options, codebase);

      expect(needProjectIdStub.calledOnce).to.be.true;
      expect(mockDelegate.validate.calledOnce).to.be.true;
      expect(mockDelegate.build.calledOnce).to.be.true;
      expect(mockDelegate.discoverBuild.calledOnce).to.be.true;
      expect(result).to.deep.equal({
        "functions.yaml": yaml.dump(mockBuild),
      });
    });

    it("should throw if codebase has no source", async () => {
      const options = { config: { path: (s: string) => s, projectDir: "dir" } };
      const codebase: projectConfig.ValidatedSingle = {
        codebase: "default",
        runtime: supported.latest("nodejs") as supported.ActiveRuntime,
      } as unknown as projectConfig.ValidatedSingle;

      await expect(exportIac.getInternalIac(options, codebase)).to.be.rejectedWith(
        "Cannot export a codebase with no source",
      );
    });

    it("should throw an error if discoverBuild fails", async () => {
      mockDelegate.discoverBuild.rejects(new Error("Failed to discover build"));

      const options = { config: { path: (s: string) => s, projectDir: "dir" } };
      const codebase: projectConfig.ValidatedSingle = {
        source: "src",
        codebase: "default",
        runtime: supported.latest("nodejs") as supported.ActiveRuntime,
      };

      await expect(exportIac.getInternalIac(options, codebase)).to.be.rejectedWith(
        "Failed to discover build",
      );
    });
  });
});
