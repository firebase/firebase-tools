import * as sinon from "sinon";
import { expect } from "chai";
import { Command } from "../command";
import { command as apphostingBackendsCreate } from "./apphosting-backends-create";
import * as backend from "../apphosting/backend";

describe("apphosting:backends:create", () => {
  const PROJECT_ID = "test-project";
  let command: Command;
  let doSetupStub: sinon.SinonStub;

  beforeEach(() => {
    command = apphostingBackendsCreate;
    (command as unknown as { befores: unknown[] }).befores = []; // Bypass pre-action hooks for unit testing action
    doSetupStub = sinon.stub(backend, "doSetup").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should default runtime to undefined when no flag provided", async () => {
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
