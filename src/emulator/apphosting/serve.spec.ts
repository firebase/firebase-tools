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
  let detectStartCommandStub: sinon.SinonStub;
  let configsStub: sinon.SinonStubbedInstance<typeof configsImport>;
  let resolveProjectPathStub: sinon.SinonStub;
  let listRunningWithInfoStub: sinon.SinonStub;
  let setEnvVarsForEmulatorsStub: sinon.SinonStub;
  let accessSecretVersionStub: sinon.SinonStub;

  beforeEach(() => {
    checkListenableStub = sinon.stub(portUtils, "checkListenable");
    wrapSpawnStub = sinon.stub(spawn, "wrapSpawn");
    spawnWithCommandStringStub = sinon.stub(spawn, "spawnWithCommandString");
    detectStartCommandStub = sinon.stub(utils, "detectStartCommand");
    configsStub = sinon.stub(configsImport);
    resolveProjectPathStub = sinon.stub(projectPathImport, "resolveProjectPath");

    listRunningWithInfoStub = sinon.stub(emulatorRegistry.EmulatorRegistry, "listRunningWithInfo");
    setEnvVarsForEmulatorsStub = sinon.stub(emulatorEnvs, "setEnvVarsForEmulators");

    resolveProjectPathStub.returns("");
    detectStartCommandStub.returns("npm run dev");

    accessSecretVersionStub = sinon.stub(secrets, "accessSecretVersion");
  });

  afterEach(() => {
    wrapSpawnStub.restore();
    detectStartCommandStub.restore();
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
