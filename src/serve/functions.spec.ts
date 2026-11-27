import { expect } from "chai";
import * as sinon from "sinon";
import { FunctionsServer } from "./functions";
import * as functionsEmulator from "../emulator/functionsEmulator";
import * as projectUtils from "../projectUtils";
import * as auth from "../auth";
import * as projectConfig from "../functions/projectConfig";
import * as emulatorRegistry from "../emulator/registry";
import * as commandUtils from "../emulator/commandUtils";
describe("FunctionsServer", () => {
  const sandbox = sinon.createSandbox();

  let functionsEmulatorStub: sinon.SinonStub;
  let needProjectIdStub: sinon.SinonStub;
  let getProjectDefaultAccountStub: sinon.SinonStub;
  let normalizeAndValidateStub: sinon.SinonStub;
  let startRegistryStub: sinon.SinonStub;

  let functionsEmulatorInstance: {
    start: sinon.SinonStub;
    connect: sinon.SinonStub;
    stop: sinon.SinonStub;
  };

  beforeEach(() => {
    functionsEmulatorInstance = {
      start: sandbox.stub().resolves(),
      connect: sandbox.stub().resolves(),
      stop: sandbox.stub().resolves(),
    };
    functionsEmulatorStub = sandbox
      .stub(functionsEmulator, "FunctionsEmulator")
      .returns(functionsEmulatorInstance as any);

    needProjectIdStub = sandbox.stub(projectUtils, "needProjectId").returns("project-id");
    getProjectDefaultAccountStub = sandbox.stub(auth, "getProjectDefaultAccount").returns({
      user: { email: "test@test.com" },
      tokens: { access_token: "token" },
    } as any);
    normalizeAndValidateStub = sandbox
      .stub(projectConfig, "normalizeAndValidate")
      .returns([{ source: "functions", codebase: "default", runtime: "nodejs18" }]);
    startRegistryStub = sandbox.stub(emulatorRegistry.EmulatorRegistry, "start").resolves();
    sandbox.stub(commandUtils, "parseInspectionPort").returns(9229);
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should throw when calling methods before start", async () => {
    const server = new FunctionsServer();
    expect(() => server.get()).to.throw("Must call start() before calling any other operation!");
    await expect(server.connect()).to.be.rejectedWith(
      "Must call start() before calling any other operation!",
    );
    await expect(server.stop()).to.be.rejectedWith(
      "Must call start() before calling any other operation!",
    );
  });

  it("should start the emulator with the correct args", async () => {
    const server = new FunctionsServer();
    const options = {
      config: { projectDir: "/path/to/project", src: { functions: {} } },
      projectAlias: "alias",
    };

    await server.start(options as any, {});

    expect(needProjectIdStub).to.have.been.calledOnceWith(options);
    expect(normalizeAndValidateStub).to.have.been.calledOnceWith({});
    expect(getProjectDefaultAccountStub).to.have.been.calledOnceWith("/path/to/project");
    expect(functionsEmulatorStub).to.have.been.calledOnce;
    const emulatorArgs = functionsEmulatorStub.getCall(0).args[0];
    expect(emulatorArgs.projectId).to.equal("project-id");
    expect(emulatorArgs.projectAlias).to.equal("alias");
    expect(emulatorArgs.projectDir).to.equal("/path/to/project");
    expect(emulatorArgs.emulatableBackends[0].functionsDir).to.contain("functions");
    expect(startRegistryStub).to.have.been.calledOnceWith(functionsEmulatorInstance);
  });

  it("should assign ports correctly when hosting is running", async () => {
    const server = new FunctionsServer();
    const options = {
      config: { projectDir: "/path/to/project", src: { functions: {} } },
      port: 8080,
      targets: ["hosting"],
    };

    await server.start(options as any, {});
    const emulatorArgs = functionsEmulatorStub.getCall(0).args[0];
    expect(emulatorArgs.port).to.equal(8081);
  });

  it("should assign ports correctly when hosting is NOT running", async () => {
    const server = new FunctionsServer();
    const options = {
      config: { projectDir: "/path/to/project", src: { functions: {} } },
      port: 8080,
      targets: ["functions"],
    };

    await server.start(options as any, {});
    const emulatorArgs = functionsEmulatorStub.getCall(0).args[0];
    expect(emulatorArgs.port).to.equal(8080);
  });

  it("should connect to the emulator", async () => {
    const server = new FunctionsServer();
    const options = { config: { projectDir: "/path/to/project", src: { functions: {} } } };
    await server.start(options as any, {});
    await server.connect();
    expect(functionsEmulatorInstance.connect).to.have.been.calledOnce;
  });

  it("should stop the emulator", async () => {
    const server = new FunctionsServer();
    const options = { config: { projectDir: "/path/to/project", src: { functions: {} } } };
    await server.start(options as any, {});
    await server.stop();
    expect(functionsEmulatorInstance.stop).to.have.been.calledOnce;
  });

  it("should get the emulator instance", async () => {
    const server = new FunctionsServer();
    const options = { config: { projectDir: "/path/to/project", src: { functions: {} } } };
    await server.start(options as any, {});
    const instance = server.get();
    expect(instance).to.equal(functionsEmulatorInstance);
  });
});
