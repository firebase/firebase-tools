import { expect } from "chai";
import * as sinon from "sinon";
import * as childProcess from "child_process";
import { EventEmitter } from "events";
import * as experiments from "../experiments";
import { DataConnectEmulator } from "./dataconnectEmulator";
import * as downloadableEmulators from "./downloadableEmulators";
import { FirebaseError } from "../error";
import { command as sqlInferCommand } from "../commands/dataconnect-sql-infer";
import { command as sdkGenerateCommand } from "../commands/dataconnect-sdk-generate";
import * as load from "../dataconnect/load";
import { EmulatorHubClient } from "./hubClient";
import { EmulatorHub } from "./hub";
import { Client } from "../apiv2";
import * as api from "../api";
import * as utils from "../utils";
import { build as dataconnectBuild } from "../dataconnect/build";
import { nativeSqlInferEnv } from "../dataconnect/nativeSqlInfer";
import * as cloudSqlProxy from "../dataconnect/cloudSqlProxy";

describe("DataConnectEmulator Native SQL Type Inference", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
    experiments.setEnabled("fdcnativesqlinfer", false);
    delete process.env.SQL_CONNECT_PREVIEW;
    delete process.env.SQL_CONNECT_INFER_MODE;
    delete process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING;
  });

  describe("getEnv", () => {
    it("should return process.env merged with extraEnv", async () => {
      const env = await DataConnectEmulator.getEnv(undefined, {
        CUSTOM_VAR: "custom_value",
      });
      expect(env.CUSTOM_VAR).to.equal("custom_value");
    });
  });

  describe("start", () => {
    function createEmulator(configValues: Record<string, any> = {}, extraArgs: any = {}) {
      const mockConfig = {
        get: (key: string) => configValues[key],
        path: (dir: string) => dir,
      } as any;
      return new DataConnectEmulator({
        projectId: "test-proj",
        listen: [{ address: "127.0.0.1", port: 9399 }],
        configDir: "dataconnect",
        config: mockConfig,
        ...extraArgs,
      });
    }

    it("should throw if nativeSqlInferMode is present in config but fdcnativesqlinfer is disabled", async () => {
      experiments.setEnabled("fdcnativesqlinfer", false);
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "db" });

      await expect(emulator.start()).to.be.rejectedWith(
        FirebaseError,
        /Cannot use native SQL type inference because the experiment/,
      );
    });

    it("should throw if nativeSqlInferMode is pglite in config", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "pglite" });

      await expect(emulator.start()).to.be.rejectedWith(
        FirebaseError,
        "Invalid 'dataconnect.nativeSqlInferMode' \"pglite\" in firebase.json. The only supported mode is 'db'.",
      );
    });

    it("should throw if nativeSqlInferMode is invalid in config", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "other" });

      await expect(emulator.start()).to.be.rejectedWith(
        FirebaseError,
        "Invalid 'dataconnect.nativeSqlInferMode' \"other\" in firebase.json. The only supported mode is 'db'.",
      );
    });

    it("should set SQL_CONNECT_PREVIEW and SQL_CONNECT_INFER_MODE when fdcnativesqlinfer is enabled and mode is in config", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(DataConnectEmulator, "build").resolves({ metadata: {} } as any);
      const startStub = sandbox.stub(downloadableEmulators, "start").resolves();
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "db" });
      (emulator as any).emulatorClient = { getInfo: sandbox.stub().resolves({ version: "1.0" }) };

      await emulator.start();

      expect(startStub.calledOnce).to.be.true;
      const passedEnv = startStub.firstCall.args[2]!;
      expect(passedEnv.SQL_CONNECT_PREVIEW).to.equal("native_sql_type_inference");
      expect(passedEnv.SQL_CONNECT_INFER_MODE).to.equal("db");
    });

    it("should merge SQL_CONNECT_PREVIEW with existing flags", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(DataConnectEmulator, "build").resolves({ metadata: {} } as any);
      const startStub = sandbox.stub(downloadableEmulators, "start").resolves();
      process.env.SQL_CONNECT_PREVIEW = "unified_model";
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "db" });
      (emulator as any).emulatorClient = { getInfo: sandbox.stub().resolves({ version: "1.0" }) };

      await emulator.start();

      expect(startStub.calledOnce).to.be.true;
      const passedEnv = startStub.firstCall.args[2]!;
      expect(passedEnv.SQL_CONNECT_PREVIEW).to.equal("unified_model,native_sql_type_inference");
      expect(passedEnv.SQL_CONNECT_INFER_MODE).to.equal("db");
    });

    it("should preserve SQL_CONNECT_PREVIEW=* when set to wildcard", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(DataConnectEmulator, "build").resolves({ metadata: {} } as any);
      const startStub = sandbox.stub(downloadableEmulators, "start").resolves();
      process.env.SQL_CONNECT_PREVIEW = "*";
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "db" });
      (emulator as any).emulatorClient = { getInfo: sandbox.stub().resolves({ version: "1.0" }) };

      await emulator.start();

      expect(startStub.calledOnce).to.be.true;
      const passedEnv = startStub.firstCall.args[2]!;
      expect(passedEnv.SQL_CONNECT_PREVIEW).to.equal("*");
      expect(passedEnv.SQL_CONNECT_INFER_MODE).to.equal("db");
    });

    it("should pass the preview flag to the pre-build so it does not delete _inferred_types.gql", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      const buildStub = sandbox
        .stub(DataConnectEmulator, "build")
        .resolves({ metadata: {} } as any);
      sandbox.stub(downloadableEmulators, "start").resolves();
      const emulator = createEmulator({ "dataconnect.nativeSqlInferMode": "db" });
      (emulator as any).emulatorClient = { getInfo: sandbox.stub().resolves({ version: "1.0" }) };

      await emulator.start();

      expect(buildStub.calledOnce).to.be.true;
      expect(buildStub.firstCall.args[0].extraEnv).to.deep.include({
        SQL_CONNECT_PREVIEW: "native_sql_type_inference",
        SQL_CONNECT_INFER_MODE: "db",
      });
    });
  });

  describe("sqlInfer", () => {
    it("should spawn fdc sql infer with all provided arguments and pass connection string via FIREBASE_DATACONNECT_POSTGRESQL_STRING", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(downloadableEmulators, "downloadIfNecessary").resolves({
        binary: "fdc",
      } as any);

      const fakeProc: any = new EventEmitter();
      let capturedBinary = "";
      let capturedArgs: string[] = [];
      let capturedEnv: any = {};
      sandbox.stub(childProcess, "spawn").callsFake((bin: any, args: any, opts: any) => {
        capturedBinary = bin;
        capturedArgs = args;
        capturedEnv = opts?.env;
        setImmediate(() => fakeProc.emit("close", 0));
        return fakeProc;
      });

      await DataConnectEmulator.sqlInfer({
        configDir: "/path/to/dataconnect",
        connectorId: "my-conn",
        connectionString: "postgres://127.0.0.1:5432/db",
      });

      expect(capturedBinary).to.equal("fdc");
      expect(capturedArgs).to.include("--config_dir=/path/to/dataconnect");
      expect(capturedArgs).to.include("--connector_id=my-conn");
      expect(capturedArgs.some((a) => a.startsWith("--local_connection_string"))).to.be.false;
      expect(capturedEnv.FIREBASE_DATACONNECT_POSTGRESQL_STRING).to.equal(
        "postgres://127.0.0.1:5432/db",
      );
    });

    it("should reject with FirebaseError if child process exits with non-zero code", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(downloadableEmulators, "downloadIfNecessary").resolves({
        binary: "fdc",
      } as any);

      const fakeProc: any = new EventEmitter();
      sandbox.stub(childProcess, "spawn").callsFake(() => {
        setImmediate(() => fakeProc.emit("close", 1));
        return fakeProc;
      });

      await expect(
        DataConnectEmulator.sqlInfer({
          configDir: "/path/to/dataconnect",
        }),
      ).to.be.rejectedWith(FirebaseError, "'fdc sql infer' failed with exit code 1");
    });
  });

  describe("dataconnect:sql:infer command", () => {
    it("should throw error if fdcnativesqlinfer experiment is disabled", async () => {
      experiments.setEnabled("fdcnativesqlinfer", false);
      const options: any = {
        projectId: "test-proj",
        config: {
          get: () => undefined,
        },
      };

      await expect((sqlInferCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        /Cannot use native SQL type inference because the experiment/,
      );
    });

    it("should throw error if nativeSqlInferMode is missing in firebase.json", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);

      const options: any = {
        projectId: "test-proj",
        config: {
          get: () => undefined,
        },
      };

      await expect((sqlInferCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        "Missing required configuration 'dataconnect.nativeSqlInferMode' in firebase.json",
      );
    });

    it("should throw error if nativeSqlInferMode is invalid in firebase.json", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) =>
            key === "dataconnect.nativeSqlInferMode" ? "invalid_mode" : undefined,
        },
      };

      await expect((sqlInferCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        "Invalid 'dataconnect.nativeSqlInferMode' \"invalid_mode\" in firebase.json",
      );
    });

    it("should execute inference", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);
      sandbox.stub(api, "dataConnectLocalConnString").returns("postgres://127.0.0.1:5432/testdb");

      const sqlInferStub = sandbox.stub(DataConnectEmulator, "sqlInfer").resolves();

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) => {
            if (key === "dataconnect.nativeSqlInferMode") return "db";
            return undefined;
          },
        },
      };

      await (sqlInferCommand as any).actionFn(options);

      expect(sqlInferStub.calledOnce).to.be.true;
      expect(sqlInferStub.firstCall.args[0].extraEnv).to.deep.equal({
        SQL_CONNECT_PREVIEW: "native_sql_type_inference",
        SQL_CONNECT_INFER_MODE: "db",
      });
    });

    it("should reuse connection string when emulator is already running", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);

      sandbox.stub(EmulatorHubClient.prototype, "foundHub").returns(true);
      sandbox.stub(EmulatorHubClient.prototype, "getEmulators").resolves({
        dataconnect: { host: "127.0.0.1", port: 9399 },
      } as any);
      sandbox.stub(Client.prototype, "get").resolves({
        body: {
          services: [
            { serviceId: "myservice", connectionString: "postgres://running-host:5432/testdb" },
          ],
        },
      } as any);

      const sqlInferStub = sandbox.stub(DataConnectEmulator, "sqlInfer").resolves();

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "db" : undefined),
        },
      };

      await (sqlInferCommand as any).actionFn(options);

      expect(sqlInferStub.calledOnce).to.be.true;
      expect(sqlInferStub.firstCall.args[0].connectionString).to.equal(
        "postgres://running-host:5432/testdb",
      );
    });

    it("should throw error when mode is db and emulator is not running and no connection string is provided", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);
      sandbox.stub(EmulatorHubClient.prototype, "foundHub").returns(false);

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) => {
            if (key === "dataconnect.nativeSqlInferMode") return "db";
            return undefined;
          },
        },
      };

      await expect((sqlInferCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        "Cannot run type inference in db mode without an active database connection. Start the Data Connect emulator in a separate terminal ('firebase emulators:start') or set the database connection string via FIREBASE_DATACONNECT_POSTGRESQL_STRING.",
      );
    });

    it("should throw error if nativeSqlInferMode is pglite in firebase.json", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) =>
            key === "dataconnect.nativeSqlInferMode" ? "pglite" : undefined,
        },
      };

      await expect((sqlInferCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        "Invalid 'dataconnect.nativeSqlInferMode' \"pglite\" in firebase.json. The only supported mode is 'db'.",
      );
    });

    it("should use FIREBASE_DATACONNECT_POSTGRESQL_STRING when available in db mode", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);
      sandbox.stub(api, "dataConnectLocalConnString").returns("postgres://my-custom-host:5432/mydb");
      const hubStub = sandbox.stub(EmulatorHubClient.prototype, "foundHub");

      const sqlInferStub = sandbox.stub(DataConnectEmulator, "sqlInfer").resolves();

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) => {
            if (key === "dataconnect.nativeSqlInferMode") return "db";
            return undefined;
          },
        },
      };

      await (sqlInferCommand as any).actionFn(options);

      expect(hubStub.notCalled).to.be.true;
      expect(sqlInferStub.calledOnce).to.be.true;
      expect(sqlInferStub.firstCall.args[0].connectionString).to.equal(
        "postgres://my-custom-host:5432/mydb",
      );
    });

    it("should fall back to EmulatorHub.MISSING_PROJECT_PLACEHOLDER when projectId is not provided", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      const pickStub = sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);
      sandbox.stub(api, "dataConnectLocalConnString").returns("postgres://127.0.0.1:5432/testdb");

      const sqlInferStub = sandbox.stub(DataConnectEmulator, "sqlInfer").resolves();

      const options: any = {
        config: {
          get: (key: string) => {
            if (key === "dataconnect.nativeSqlInferMode") return "db";
            return undefined;
          },
        },
      };

      await (sqlInferCommand as any).actionFn(options);

      expect(pickStub.calledOnce).to.be.true;
      expect(pickStub.firstCall.args[0]).to.equal(EmulatorHub.MISSING_PROJECT_PLACEHOLDER);
      expect(sqlInferStub.calledOnce).to.be.true;
    });

    it("should not start the Cloud SQL proxy when --cloud-sql is not passed", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickOneService").resolves({
        sourceDirectory: "dataconnect",
        dataConnectYaml: {
          serviceId: "myservice",
          schema: {
            datasource: {
              postgresql: { database: "testdb" },
            },
          },
        },
      } as any);
      sandbox.stub(api, "dataConnectLocalConnString").returns("postgres://127.0.0.1:5432/testdb");
      const proxyStub = sandbox.stub(cloudSqlProxy, "startLocalProxyForService");
      const sqlInferStub = sandbox.stub(DataConnectEmulator, "sqlInfer").resolves();

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "db" : undefined),
        },
      };

      await (sqlInferCommand as any).actionFn(options);

      expect(proxyStub.called).to.be.false;
      expect(sqlInferStub.firstCall.args[0].connectionString).to.equal(
        "postgres://127.0.0.1:5432/testdb",
      );
    });
  });

  describe("generate", () => {
    it("should pass extraEnv to getEnv", async () => {
      sandbox.stub(downloadableEmulators, "downloadIfNecessary").resolves({ binary: "fdc" } as any);
      const fakeProc: any = new EventEmitter();
      let capturedEnv: any;
      sandbox.stub(childProcess, "spawn").callsFake((bin: any, args: any, opts: any) => {
        capturedEnv = opts?.env;
        setImmediate(() => fakeProc.emit("close", 0));
        return fakeProc;
      });

      await DataConnectEmulator.generate({
        configDir: "dataconnect",
        extraEnv: {
          SQL_CONNECT_PREVIEW: "native_sql_type_inference",
          SQL_CONNECT_INFER_MODE: "db",
        },
      });

      expect(capturedEnv.SQL_CONNECT_PREVIEW).to.equal("native_sql_type_inference");
      expect(capturedEnv.SQL_CONNECT_INFER_MODE).to.equal("db");
    });
  });

  describe("build", () => {
    it("should pass extraEnv to getEnv", async () => {
      sandbox.stub(downloadableEmulators, "downloadIfNecessary").resolves({ binary: "fdc" } as any);
      let capturedEnv: any;
      sandbox.stub(childProcess, "spawnSync").callsFake((bin: any, args: any, opts: any) => {
        capturedEnv = opts?.env;
        return { status: 0, stdout: "{}", stderr: "" } as any;
      });

      await DataConnectEmulator.build({
        configDir: "dataconnect",
        extraEnv: {
          SQL_CONNECT_PREVIEW: "native_sql_type_inference",
          SQL_CONNECT_INFER_MODE: "db",
        },
      });

      expect(capturedEnv.SQL_CONNECT_PREVIEW).to.equal("native_sql_type_inference");
      expect(capturedEnv.SQL_CONNECT_INFER_MODE).to.equal("db");
    });
  });

  describe("dataconnect:sdk:generate command", () => {
    it("should pass SQL_CONNECT_PREVIEW and SQL_CONNECT_INFER_MODE=db to DataConnectEmulator.generate", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickServices").resolves([
        {
          sourceDirectory: "dataconnect",
          dataConnectYaml: { serviceId: "myservice" },
          connectorInfo: [
            {
              connectorYaml: {
                generate: {
                  javascriptSdk: {},
                },
              },
            },
          ],
        },
      ] as any);
      const generateStub = sandbox.stub(DataConnectEmulator, "generate").resolves();
      const options: any = {
        projectId: "test-proj",
        config: {
          has: (key: string) => key === "dataconnect",
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "db" : undefined),
        },
      };

      await (sdkGenerateCommand as any).actionFn(options);

      expect(generateStub.calledOnce).to.be.true;
      expect(generateStub.firstCall.args[0].extraEnv).to.deep.include({
        SQL_CONNECT_PREVIEW: "native_sql_type_inference",
        SQL_CONNECT_INFER_MODE: "db",
        FIREBASE_DATACONNECT_POSTGRESQL_STRING: "",
      });
    });

    it("should throw error if nativeSqlInferMode is pglite in firebase.json", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      const options: any = {
        projectId: "test-proj",
        config: {
          has: (key: string) => key === "dataconnect",
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "pglite" : undefined),
        },
      };

      await expect((sdkGenerateCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        "Invalid 'dataconnect.nativeSqlInferMode' \"pglite\" in firebase.json. The only supported mode is 'db'.",
      );
    });

    it("should throw error if nativeSqlInferMode is set but fdcnativesqlinfer is disabled", async () => {
      experiments.setEnabled("fdcnativesqlinfer", false);
      const options: any = {
        projectId: "test-proj",
        config: {
          has: (key: string) => key === "dataconnect",
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "db" : undefined),
        },
      };

      await expect((sdkGenerateCommand as any).actionFn(options)).to.be.rejectedWith(
        FirebaseError,
        /Cannot use native SQL type inference because the experiment/,
      );
    });

    it("should log a staleness warning whenever nativeSqlInferMode is set", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      sandbox.stub(load, "pickServices").resolves([
        {
          sourceDirectory: "dataconnect",
          dataConnectYaml: { serviceId: "myservice" },
          connectorInfo: [
            {
              connectorYaml: {
                generate: {
                  javascriptSdk: {},
                },
              },
            },
          ],
        },
      ] as any);
      sandbox.stub(DataConnectEmulator, "generate").resolves();
      const logWarningStub = sandbox.stub(utils, "logWarning");

      const options: any = {
        projectId: "test-proj",
        config: {
          has: (key: string) => key === "dataconnect",
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "db" : undefined),
        },
      };

      await (sdkGenerateCommand as any).actionFn(options);

      expect(logWarningStub.calledOnce).to.be.true;
      expect(logWarningStub.firstCall.args[0]).to.include(
        "Native SQL type inference is enabled. This command consumes the existing",
      );
    });
  });

  describe("dataconnect build", () => {
    it("should withhold the connection string so the build stays offline", async () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      const buildStub = sandbox.stub(DataConnectEmulator, "build").resolves({} as any);

      const options: any = {
        projectId: "test-proj",
        config: {
          get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? "db" : undefined),
        },
      };

      await dataconnectBuild(options, "dataconnect", {} as any);

      expect(buildStub.calledOnce).to.be.true;
      expect(buildStub.firstCall.args[0].extraEnv).to.deep.equal({
        SQL_CONNECT_PREVIEW: "native_sql_type_inference",
        SQL_CONNECT_INFER_MODE: "db",
        FIREBASE_DATACONNECT_POSTGRESQL_STRING: "",
      });
    });
  });

  describe("nativeSqlInferEnv", () => {
    function mockConfig(mode?: string): any {
      return {
        get: (key: string) => (key === "dataconnect.nativeSqlInferMode" ? mode : undefined),
      };
    }

    it("should return an empty object when no mode is configured", () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      expect(nativeSqlInferEnv(mockConfig())).to.deep.equal({});
    });

    it("should throw when a mode is configured but the experiment is disabled", () => {
      experiments.setEnabled("fdcnativesqlinfer", false);
      expect(() => nativeSqlInferEnv(mockConfig("db"))).to.throw(
        FirebaseError,
        /Cannot use native SQL type inference because the experiment/,
      );
    });

    it("should return both env vars when enabled", () => {
      experiments.setEnabled("fdcnativesqlinfer", true);
      expect(nativeSqlInferEnv(mockConfig("db"))).to.deep.equal({
        SQL_CONNECT_PREVIEW: "native_sql_type_inference",
        SQL_CONNECT_INFER_MODE: "db",
      });
    });
  });
});
