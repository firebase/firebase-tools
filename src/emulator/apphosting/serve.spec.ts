import * as sinon from "sinon";
import { expect } from "chai";
import * as portUtils from "../portUtils";
import * as spawn from "../../init/spawn";
import * as serve from "./serve";
import { DEFAULT_PORTS } from "../constants";
import * as utils from "./developmentServer";
import * as configsImport from "./config";
import * as projectPathImport from "../../projectPath";
import { AppHostingYamlConfig } from "../../apphosting/yaml";
import * as emulatorRegistry from "../registry";
import * as emulatorEnvs from "../env";
import * as secrets from "../../gcp/secretManager";
import { FirebaseError } from "../../error";

describe("serve", () => {
  let checkListenableStub: sinon.SinonStub;
  let wrapSpawnStub: sinon.SinonStub;
  let spawnWithCommandStringStub: sinon.SinonStub;
  let detectPackageManagerStartCommandStub: sinon.SinonStub;
  let configsStub: sinon.SinonStubbedInstance<typeof configsImport>;
  let resolveProjectPathStub: sinon.SinonStub;
  let listRunningWithInfoStub: sinon.SinonStub;
  let setEnvVarsForEmulatorsStub: sinon.SinonStub;
  let accessSecretVersionStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    spawnWithCommandStringStub = sinon.stub(spawn, "spawnWithCommandString");
    detectPackageManagerStartCommandStub = sinon.stub(utils, "detectPackageManagerStartCommand");
    configsStub = sinon.stub(configsImport);
    resolveProjectPathStub = sinon.stub(projectPathImport, "resolveProjectPath");

    listRunningWithInfoStub = sinon.stub(emulatorRegistry.EmulatorRegistry, "listRunningWithInfo");
    setEnvVarsForEmulatorsStub = sinon.stub(emulatorEnvs, "setEnvVarsForEmulators");

    resolveProjectPathStub.returns("");
    detectPackageManagerStartCommandStub.returns("npm run dev");

    accessSecretVersionStub = sinon.stub(secrets, "accessSecretVersion");
  });

  afterEach(() => {
    wrapSpawnStub.restore();
    detectPackageManagerStartCommandStub.restore();
    checkListenableStub.restore();
    sinon.verifyAndRestore();
  });

  describe("start", () => {
    beforeEach(() => {
      listRunningWithInfoStub.returns([]);
      spawnWithCommandStringStub.resolves();
    });

    it("should use user-provided port if one is defined", async () => {
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      const res = await serve.start({ port: 9999 });
      expect(res.port).to.equal(9999);
    });

    it("should only select an available port to serve", async () => {
      checkListenableStub.onFirstCall().returns(false);
      checkListenableStub.onSecondCall().returns(false);
      checkListenableStub.onThirdCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      const res = await serve.start();
      expect(res.port).to.equal(DEFAULT_PORTS.apphosting + 2);
    });

    it("should run the custom start command if one is provided", async () => {
      const startCommand = "custom test command";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      await serve.start({ startCommand });

      expect(spawnWithCommandStringStub).to.be.called;
      expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
    });

    it("should append --port if an ng serve command is detected", async () => {
      const startCommand = "ng serve --verbose";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      await serve.start({ startCommand });

      expect(spawnWithCommandStringStub).to.be.called;
      expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand + " --port 5002");
    });

    it("should use the port from the start command if one is provided", async () => {
      const startCommand = "ng serve --port 5555";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      const res = await serve.start({ startCommand });

      expect(res.port).to.equal(5555);
      expect(spawnWithCommandStringStub).to.be.called;
      expect(spawnWithCommandStringStub.getCall(0).args[0]).to.eq(startCommand);
    });

    it("should accept -p for port in start command", async () => {
      const startCommand = "ng serve -p 5555";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      const res = await serve.start({ startCommand });

      expect(res.port).to.equal(5555);
    });

    it("should reject the custom command if it conflicts with a fixed port", async () => {
      const startCommand = "ng serve --port 5004";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      // Simulate a fixed port passed from the emulator controller (e.g. from firebase.json)
      await expect(serve.start({ startCommand, port: 5000, portFixed: true })).to.be.rejectedWith(
        FirebaseError,
        /Port 5004 specified in start command conflicts with port 5000 specified in firebase.json/,
      );

      expect(spawnWithCommandStringStub).to.not.be.called;
    });

    it("should allow custom command port if it matches the fixed port", async () => {
      const startCommand = "ng serve --port 5000";
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(AppHostingYamlConfig.empty());

      const res = await serve.start({ startCommand, port: 5000, portFixed: true });

      expect(res.port).to.equal(5000);
      expect(spawnWithCommandStringStub).to.be.called;
    });

    it("Should pass plaintext environment variables", async () => {
      const yaml = AppHostingYamlConfig.empty();
      yaml.env["FOO"] = { value: "BAR" };
      checkListenableStub.onFirstCall().returns(true);
      configsStub.getLocalAppHostingConfiguration.resolves(yaml);

      await serve.start();

      expect(accessSecretVersionStub).to.not.be.called;
      expect(spawnWithCommandStringStub).to.be.called;
      expect(spawnWithCommandStringStub.getCall(0).args[2]).to.deep.include({ FOO: "BAR" });
    });

    describe("secret env vars", () => {
      it("Should resolve full secrets without projectId", async () => {
        const yaml = AppHostingYamlConfig.empty();
        yaml.env["FOO"] = { secret: "projects/p/secrets/s" };
        checkListenableStub.onFirstCall().returns(true);
        configsStub.getLocalAppHostingConfiguration.resolves(yaml);
        accessSecretVersionStub.withArgs("p", "s", "latest").resolves("BAR");

        await serve.start();

        expect(accessSecretVersionStub).to.be.calledWith("p", "s", "latest");
        expect(spawnWithCommandStringStub).to.be.called;
        expect(spawnWithCommandStringStub.getCall(0).args[2]).to.deep.include({ FOO: "BAR" });
      });

      it("Should resolve full secrets versions without projectId", async () => {
        const yaml = AppHostingYamlConfig.empty();
        yaml.env["FOO"] = { secret: "projects/p/secrets/s/versions/1" };
        checkListenableStub.onFirstCall().returns(true);
        configsStub.getLocalAppHostingConfiguration.resolves(yaml);
        accessSecretVersionStub.withArgs("p", "s", "1").resolves("BAR");

        await serve.start();

        expect(accessSecretVersionStub).to.be.calledWith("p", "s", "1");
        expect(spawnWithCommandStringStub).to.be.called;
        expect(spawnWithCommandStringStub.getCall(0).args[2]).to.deep.include({ FOO: "BAR" });
      });

      it("Should handle secret IDs if project is provided", async () => {
        const yaml = AppHostingYamlConfig.empty();
        yaml.env["FOO"] = { secret: "s" };
        checkListenableStub.onFirstCall().returns(true);
        configsStub.getLocalAppHostingConfiguration.resolves(yaml);
        accessSecretVersionStub.withArgs("p", "s", "latest").resolves("BAR");

        await serve.start({ projectId: "p" });

        expect(accessSecretVersionStub).to.be.calledWith("p", "s", "latest");
        expect(spawnWithCommandStringStub).to.be.called;
        expect(spawnWithCommandStringStub.getCall(0).args[2]).to.deep.include({ FOO: "BAR" });
      });

      it("Should allow explicit versions", async () => {
        const yaml = AppHostingYamlConfig.empty();
        yaml.env["FOO"] = { secret: "s@1" };
        checkListenableStub.onFirstCall().returns(true);
        configsStub.getLocalAppHostingConfiguration.resolves(yaml);
        accessSecretVersionStub.withArgs("p", "s", "1").resolves("BAR");

        await serve.start({ projectId: "p" });

        expect(accessSecretVersionStub).to.be.calledWith("p", "s", "1");
        expect(spawnWithCommandStringStub).to.be.called;
        expect(spawnWithCommandStringStub.getCall(0).args[2]).to.deep.include({ FOO: "BAR" });
      });

      it("Should have a clear error if project ID is required but not present", async () => {
        const yaml = AppHostingYamlConfig.empty();
        yaml.env["FOO"] = { secret: "s" };
        checkListenableStub.onFirstCall().returns(true);
        configsStub.getLocalAppHostingConfiguration.resolves(yaml);

        await expect(serve.start(/* no project ID */)).to.be.rejectedWith(
          FirebaseError,
          /Cannot load secret s without a project. Please use .*firebase use.* or pass the --project flag/,
        );

        expect(accessSecretVersionStub).to.not.be.called;
        expect(spawnWithCommandStringStub).to.not.be.called;
      });
    });
  });

  describe("getEmulatorEnvs", () => {
    it("should omit apphosting emulator", () => {
      listRunningWithInfoStub.returns([{ name: "apphosting" }, { name: "functions" }]);
      serve.getEmulatorEnvs();

      expect(setEnvVarsForEmulatorsStub).to.be.calledWith({}, [{ name: "functions" }]);
    });
  });
});
