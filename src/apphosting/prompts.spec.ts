import * as sinon from "sinon";
import { expect } from "chai";
import * as prompts from "./prompts";
import * as experiments from "../experiments";
import * as apphosting from "../gcp/apphosting";
import * as promptImport from "../prompt";

describe("prompts", () => {
  const projectId = "projectId";
  const location = "us-central1";

  let isEnabledStub: sinon.SinonStub;
  let listSupportedRuntimesStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;

  beforeEach(() => {
    isEnabledStub = sinon.stub(experiments, "isEnabled");
    listSupportedRuntimesStub = sinon.stub(apphosting, "listSupportedRuntimes");
    selectStub = sinon.stub(promptImport, "select");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("resolveRuntime", () => {
    it("should return runtime if provided", async () => {
      const result = await prompts.resolveRuntime(projectId, location, false, "nodejs22");
      expect(result).to.equal("nodejs22");
    });

    it("should return undefined if abiu experiment is disabled", async () => {
      isEnabledStub.withArgs("abiu").returns(false);
      const result = await prompts.resolveRuntime(projectId, location, false);
      expect(result).to.be.undefined;
    });

    it("should return DEFAULT_RUNTIME in non-interactive mode", async () => {
      isEnabledStub.withArgs("abiu").returns(true);
      const result = await prompts.resolveRuntime(projectId, location, true);
      expect(result).to.equal(prompts.DEFAULT_RUNTIME);
    });

    it("should call promptRuntime and return selected runtime in interactive mode", async () => {
      isEnabledStub.withArgs("abiu").returns(true);
      listSupportedRuntimesStub.resolves([
        { runtimeId: "nodejs22", automaticBaseImageUpdatesSupported: true },
      ]);
      selectStub.resolves("nodejs22");

      const result = await prompts.resolveRuntime(projectId, location, false);
      expect(result).to.equal("nodejs22");
      expect(selectStub).to.be.calledOnce;
    });
  });
});
