import * as sinon from "sinon";
import { expect } from "chai";
import { Command } from "../command";
import { command as apphostingBackendsCreate } from "./apphosting-backends-create";
import * as backend from "../apphosting/backend";
import * as experiments from "../experiments";
import { FirebaseError } from "../error";

describe("apphosting:backends:create", () => {
  const PROJECT_ID = "test-project";
  let command: Command;
  let originalBefores: unknown[];
  let isEnabledStub: sinon.SinonStub;
  let doSetupStub: sinon.SinonStub;

  beforeEach(() => {
    command = apphostingBackendsCreate;
    originalBefores = (command as unknown as { befores: unknown[] }).befores;
    (command as unknown as { befores: unknown[] }).befores = []; // Bypass pre-action hooks for unit testing action
    isEnabledStub = sinon.stub(experiments, "isEnabled");
    doSetupStub = sinon.stub(backend, "doSetup").resolves();
  });

  afterEach(() => {
    (command as unknown as { befores: unknown[] }).befores = originalBefores;
    sinon.restore();
  });

  it("should fail and name the missing flags in non-interactive mode", async () => {
    isEnabledStub.returns(true);
    const options = {
      project: PROJECT_ID,
      nonInteractive: true,
      primaryRegion: "us-central1",
    };

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      /--non-interactive option requires --backend and --primary-region \(missing: --backend\)/,
    );
    expect(doSetupStub).to.not.be.called;
  });

  it("should list both flags when --backend and --primary-region are missing", async () => {
    isEnabledStub.returns(true);
    const options = { project: PROJECT_ID, nonInteractive: true };

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      /\(missing: --backend, --primary-region\)/,
    );
    expect(doSetupStub).to.not.be.called;
  });

  it("should fail if runtime flag is used without experiment enabled", async () => {
    isEnabledStub.returns(false);
    const options = {
      project: PROJECT_ID,
      runtime: "nodejs22",
      backend: "test-backend",
      primaryRegion: "us-central1",
    };

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      /The --runtime flag is only available when the 'abiu' experiment is enabled/,
    );
  });

  it("should default runtime to undefined when experiment is on and no flag provided", async () => {
    isEnabledStub.returns(true);
    const options = {
      project: PROJECT_ID,
      nonInteractive: true,
      backend: "test-backend",
      primaryRegion: "us-central1",
      serviceAccount: "",
    };

    await command.runner()(options);

    expect(doSetupStub).to.be.calledWith(
      PROJECT_ID,
      true, // nonInteractive
      undefined, // webAppName
      "test-backend", // backendId
      "", // serviceAccount default
      "us-central1", // primaryRegion
      undefined, // rootDir
      undefined, // expected runtime (doSetup handles the default to 'nodejs')
    );
  });

  it("should pass explicit empty runtime", async () => {
    isEnabledStub.returns(true);
    const options = {
      project: PROJECT_ID,
      nonInteractive: true,
      backend: "test-backend",
      primaryRegion: "us-central1",
      serviceAccount: "",
      runtime: "",
    };

    await command.runner()(options);

    expect(doSetupStub).to.be.calledWith(
      PROJECT_ID,
      true,
      undefined,
      "test-backend",
      "",
      "us-central1",
      undefined,
      "", // explicit empty string should be preserved
    );
  });

  it("should pass explicit runtime", async () => {
    isEnabledStub.returns(true);
    const options = {
      project: PROJECT_ID,
      nonInteractive: true,
      backend: "test-backend",
      primaryRegion: "us-central1",
      serviceAccount: "",
      runtime: "nodejs22",
    };

    await command.runner()(options);

    expect(doSetupStub).to.be.calledWith(
      PROJECT_ID,
      true,
      undefined,
      "test-backend",
      "",
      "us-central1",
      undefined,
      "nodejs22",
    );
  });

  it("should default runtime if flag is present without value (boolean true)", async () => {
    isEnabledStub.returns(true);
    const options = {
      project: PROJECT_ID,
      nonInteractive: true,
      backend: "test-backend",
      primaryRegion: "us-central1",
      serviceAccount: "",
      runtime: true, // Flag present without value
    };

    await command.runner()(options);

    expect(doSetupStub).to.be.calledWith(
      PROJECT_ID,
      true,
      undefined,
      "test-backend",
      "",
      "us-central1",
      undefined,
      undefined, // Should default to undefined, then nodejs in doSetup
    );
  });
});
