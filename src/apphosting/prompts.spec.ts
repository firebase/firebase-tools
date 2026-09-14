import * as sinon from "sinon";
import { expect } from "chai";
import * as prompts from "./prompts";
import * as apphosting from "../gcp/apphosting";
import * as promptImport from "../prompt";

describe("prompts", () => {
  const projectId = "projectId";
  const location = "us-central1";

  let listSupportedRuntimesStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;

  beforeEach(() => {
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

    it("should return DEFAULT_RUNTIME in non-interactive mode", async () => {
      const result = await prompts.resolveRuntime(projectId, location, true);
      expect(result).to.equal(prompts.DEFAULT_RUNTIME);
    });

    it("should call promptRuntime and return selected runtime in interactive mode", async () => {
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
