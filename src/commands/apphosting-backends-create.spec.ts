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
  let isEnabledStub: sinon.SinonStub;
  let doSetupStub: sinon.SinonStub;

  beforeEach(() => {
    command = apphostingBackendsCreate;
    (command as unknown as { befores: unknown[] }).befores = []; // Bypass pre-action hooks for unit testing action
    isEnabledStub = sinon.stub(experiments, "isEnabled");
    doSetupStub = sinon.stub(backend, "doSetup").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should fail if ABIU flags are used without experiment enabled", async () => {
    isEnabledStub.returns(false);
    const options = {
      project: PROJECT_ID,
      runtime: "nodejs22",
      backend: "test-backend",
      primaryRegion: "us-central1",
    };

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      /The --runtime and --automatic-base-image-updates flags are only available when the 'abiu' experiment is enabled/,
    );
  });

  it("should default ABIU to enabled and runtime to empty string when experiment is on", async () => {
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
      false, // expected default automaticBaseImageUpdatesDisabled (enabled)
    );
  });

  it("should pass explicit ABIU disabled flag", async () => {
    isEnabledStub.returns(true);
    const options = {
      project: PROJECT_ID,
      nonInteractive: true,
      backend: "test-backend",
      primaryRegion: "us-central1",
      serviceAccount: "",
      automaticBaseImageUpdates: false,
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
      undefined,
      true, // automaticBaseImageUpdatesDisabled should be true
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
      false,
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
      false, // ABIU defaults to enabled even with explicit runtime
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
      false,
    );
  });
});
