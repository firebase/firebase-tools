import { expect } from "chai";
import * as sinon from "sinon";
import { serve } from "./index";
import * as hosting from "./hosting";
import { FunctionsServer } from "./functions";
import * as prepareFrameworks from "../frameworks";
import * as experiments from "../experiments";
import * as config from "../hosting/config";
import * as track from "../track";
import * as projectUtils from "../projectUtils";

describe("serve", () => {
  const sandbox = sinon.createSandbox();
  let hostingStart: sinon.SinonStub;
  let hostingStop: sinon.SinonStub;
  let hostingConnect: sinon.SinonStub;
  let functionsStart: sinon.SinonStub;
  let functionsStop: sinon.SinonStub;
  let functionsConnect: sinon.SinonStub;
  let prepareFrameworksStub: sinon.SinonStub;
  let experimentsAssertEnabledStub: sinon.SinonStub;
  let configExtractStub: sinon.SinonStub;
  let trackEmulatorStub: sinon.SinonStub;

  let processOnStub: sinon.SinonStub;
  let sigintHandler: () => void;

  beforeEach(() => {
    // Stub dependencies
    hostingStart = sandbox.stub(hosting, "start").resolves({ ports: [] });
    hostingStop = sandbox.stub(hosting, "stop").resolves();
    hostingConnect = sandbox.stub(hosting, "connect").resolves();

    functionsStart = sandbox.stub(FunctionsServer.prototype, "start").resolves();
    functionsStop = sandbox.stub(FunctionsServer.prototype, "stop").resolves();
    functionsConnect = sandbox.stub(FunctionsServer.prototype, "connect").resolves();

    prepareFrameworksStub = sandbox.stub(prepareFrameworks, "prepareFrameworks").resolves();
    experimentsAssertEnabledStub = sandbox.stub(experiments, "assertEnabled");
    configExtractStub = sandbox.stub(config, "extract");
    trackEmulatorStub = sandbox.stub(track, "trackEmulator");
    sandbox.stub(projectUtils, "getProjectId").returns("demo-project");

    // Stub process.on to capture the SIGINT handler
    processOnStub = sandbox.stub(process, "on");
    processOnStub.withArgs("SIGINT").callsFake((event, handler) => {
      sigintHandler = handler as () => void;
      return process;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  async function triggerSIGINT() {
    // Wait for the next event loop tick to ensure the handler is registered.
    await new Promise((resolve) => setImmediate(resolve));
    if (sigintHandler) {
      sigintHandler();
    }
  }

  it("should start and connect to all services, then stop on SIGINT", async () => {
    const options = {
      targets: ["hosting", "functions"],
      port: 8080,
    };
    configExtractStub.returns([]);

    const servePromise = serve(options);
    await triggerSIGINT();
    await servePromise;

    expect(hostingStart).to.have.been.calledOnceWith(options);
    expect(functionsStart).to.have.been.calledOnce;
    expect(hostingConnect).to.have.been.calledOnce;
    expect(functionsConnect).to.have.been.calledOnce;
    expect(hostingStop).to.have.been.calledOnceWith(options);
    expect(functionsStop).to.have.been.calledOnce;
  });

  it("should call prepareFrameworks when webframeworks experiment is enabled and hosting source exists", async () => {
    const options = {
      targets: ["hosting"],
      port: 8080,
    };
    configExtractStub.returns([{ source: "some-source" }]);

    const servePromise = serve(options);
    await triggerSIGINT();
    await servePromise;

    expect(experimentsAssertEnabledStub).to.have.been.calledOnceWith(
      "webframeworks",
      "emulate a web framework",
    );
    expect(prepareFrameworksStub).to.have.been.calledOnceWith(
      "emulate",
      ["hosting"],
      undefined,
      options,
    );
  });

  it("should not call prepareFrameworks if hosting target has no source", async () => {
    const options = {
      targets: ["hosting"],
      port: 8080,
    };
    configExtractStub.returns([{}]); // No source

    const servePromise = serve(options);
    await triggerSIGINT();
    await servePromise;

    expect(prepareFrameworksStub).to.not.have.been.called;
  });

  it("should throw if webframeworks experiment is not enabled", async () => {
    const options = {
      targets: ["hosting"],
      port: 8080,
    };
    configExtractStub.returns([{ source: "some-source" }]);
    const error = new Error("webframeworks experiment not enabled");
    experimentsAssertEnabledStub.throws(error);

    await expect(serve(options)).to.be.rejectedWith(error);
    expect(prepareFrameworksStub).to.not.have.been.called;
  });

  it("should track emulator run and started events", async () => {
    const options = {
      targets: ["hosting", "functions"],
      port: 8080,
    };
    configExtractStub.returns([]);

    const servePromise = serve(options);
    await triggerSIGINT();
    await servePromise;

    expect(trackEmulatorStub).to.have.been.calledWith("emulator_run", {
      emulator_name: "hosting",
      is_demo_project: "true",
    });
    expect(trackEmulatorStub).to.have.been.calledWith("emulator_run", {
      emulator_name: "functions",
      is_demo_project: "true",
    });
    expect(trackEmulatorStub).to.have.been.calledWith("emulators_started", {
      count: 2,
      count_all: 2,
      is_demo_project: "true",
    });
  });
});
