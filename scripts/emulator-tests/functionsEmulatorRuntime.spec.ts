import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/lib/providers/firestore";
import { expect } from "chai";
import { IncomingMessage, request } from "http";
import * as express from "express";
import * as fs from "fs/promises";
import * as sinon from "sinon";
import * as spawn from "cross-spawn";

import { EmulatorLog, Emulators } from "../../src/emulator/types";
import { FunctionRuntimeBundles, TIMEOUT_LONG, TIMEOUT_MED, MODULE_ROOT } from "./fixtures";
import {
  EmulatedTriggerDefinition,
  FunctionsRuntimeBundle,
  getTemporarySocketPath,
  SignatureType,
} from "../../src/emulator/functionsEmulatorShared";
import { InvokeRuntimeOpts, FunctionsEmulator } from "../../src/emulator/functionsEmulator";
import { RuntimeWorker } from "../../src/emulator/functionsRuntimeWorker";
import { streamToString, cloneDeep } from "../../src/utils";
import * as registry from "../../src/emulator/registry";
import * as logform from "logform";
import { logger } from "../../src/logger";
import * as winston from "winston";
import { FirebaseError } from "../../src/error";
import stream from "stream";
import * as path from "path";
import { ChildProcess } from "child_process";
import admin from "firebase-admin";

if ((process.env.DEBUG || "").toLowerCase().includes("spec")) {
  const dropLogLevels = (info: logform.TransformableInfo) => info.message;
  logger.add(
    new winston.transports.Console({
      level: "debug",
      format: logform.format.combine(
        logform.format.colorize(),
        logform.format.printf(dropLogLevels)
      ),
    })
  );
}

const FUNCTIONS_DIR = `./scripts/emulator-tests/functions`;

const testBackend = {
  functionsDir: FUNCTIONS_DIR,
  env: {},
  secretEnv: [],
  nodeBinary: process.execPath,
};

const functionsEmulator = new FunctionsEmulator({
  projectDir: MODULE_ROOT,
  projectId: "fake-project-id",
  emulatableBackends: [testBackend],
  adminSdkConfig: {
    projectId: "fake-project-id",
    databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
    storageBucket: "fake-project-id.appspot.com",
  },
});

async function countLogEntries(worker: RuntimeWorker): Promise<{ [key: string]: number }> {
  const runtime = worker.runtime;
  const counts: { [key: string]: number } = {};

  runtime.events.on("log", (el: EmulatorLog) => {
    console.log(el);
    counts[el.type] = (counts[el.type] || 0) + 1;
  });

  await worker.waitForDone();
  return counts;
}

async function invokeFunction(
  frb: FunctionsRuntimeBundle,
  triggers: () => {},
  signatureType: SignatureType,
  opts?: InvokeRuntimeOpts
): Promise<RuntimeWorker> {
  const sourceCode = `module.exports = (${triggers.toString()})();\n`;
  await fs.writeFile(`${FUNCTIONS_DIR}/index.js`, sourceCode);

  opts = opts || { nodeBinary: process.execPath };
  opts.ignore_warnings = true;

  const dummyTriggerDef: EmulatedTriggerDefinition = {
    name: "functionId",
    region: "region",
    id: "region-functionId",
    entryPoint: "functionId",
    platform: "gcfv1" as const,
  };
  if (signatureType !== "http") {
    dummyTriggerDef.eventTrigger = { resource: "dummyResource", eventType: "dummyType" };
  }
  functionsEmulator.setTriggersForTesting([dummyTriggerDef], testBackend);
  return functionsEmulator.invokeTrigger(
    {
      ...dummyTriggerDef,
      // Fill in with dummy trigger info based on given signature type.
      ...(signatureType === "http"
        ? { httpsTrigger: {} }
        : { eventTrigger: { eventType: "", resource: "" } }),
    },
    frb.proto,
    opts
  );
}

/**
 * Three step process:
 *   1) Wait for the runtime to be ready.
 *   2) Call the runtime with the specified bundle and collect all data.
 *   3) Wait for the runtime to exit
 */
async function callHTTPSFunction(
  worker: RuntimeWorker,
  frb: FunctionsRuntimeBundle,
  options: { path?: string; headers?: { [key: string]: string } } = {},
  requestData?: string
): Promise<string> {
  await worker.waitForSocketReady();

  const path = options.path || "/";

  const res = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = request(
      {
        method: "POST",
        headers: options.headers,
        socketPath: worker.runtime.socketPath,
        path,
      },
      resolve
    );
    req.on("error", reject);
    if (requestData) {
      req.write(requestData);
    }
    req.end();
  });

  const result = await streamToString(res);
  await worker.runtime.exit;

  return result;
}

const ADMIN_SDK_CONFIG = {
  projectId: "fake-project-id",
  databaseURL: "https://fake-project-id-default-rtdb.firebaseio.com",
  storageBucket: "fake-project-id.appspot.com",
};

interface Runtime {
  proc: ChildProcess;
  port: string;
  rawMsg: string[];
  sysMsg: Record<string, string[]>;
  stdout: string[];
  done: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function startRuntime(
  triggerName: string,
  signatureType: SignatureType,
  triggerSource: () => {}
): Promise<Runtime> {
  const env: Record<string, string> = {};
  env.FUNCTIONS_EMULATOR = "true";
  env.FIREBASE_DEBUG_MODE = "true";
  env.FIREBASE_DEBUG_FEATURES = JSON.stringify({
    skipTokenVerification: true,
    enableCors: true,
  });

  env.GCLOUD_PROJECT = ADMIN_SDK_CONFIG.projectId;
  env.FUNCTION_TARGET = triggerName;
  env.FUNCTION_SIGNATURE_TYPE = signatureType;
  env.PORT = getTemporarySocketPath();

  const sourceCode = `module.exports = (${triggerSource.toString()})();\n`;
  await fs.writeFile(`${FUNCTIONS_DIR}/index.js`, sourceCode);

  const args = ["--swc", path.join(MODULE_ROOT, "src", "emulator", "functionsEmulatorRuntime")];
  const proc = spawn(path.join(MODULE_ROOT, "node_modules/.bin/ts-node"), args, {
    env: { ...process.env, ...env },
    cwd: FUNCTIONS_DIR,
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  const runtime: Runtime = {
    proc,
    rawMsg: [],
    sysMsg: {},
    stdout: [],
    port: env["PORT"],
    done: false,
  };

  proc.on("message", (message) => {
    const msg = message.toString();
    runtime.rawMsg.push(msg);
    try {
      const m = JSON.parse(msg);
      if (m.type) {
        runtime.sysMsg[m.type] = runtime.sysMsg[m.type] || [];
        runtime.sysMsg[m.type].push(`text: ${m.text};data: ${JSON.stringify(m.data)}`);
        if (m.type === "runtime-status" && m.text) {
          if (m.text.includes("Finished")) {
            runtime.done = true;
          }
        }
      }
    } catch {
      // Carry on;
    }
    if (msg.includes(`Finished "${triggerName}" in`)) {
      runtime.done = true;
    }
  });

  proc.stdout?.on("data", (data) => {
    runtime.stdout.push(data.toString());
  });

  proc.stderr?.on("data", (data) => {
    runtime.stdout.push(data.toString());
  });

  return runtime;
}

async function triggerRuntime(runtime: Runtime, frb: FunctionsRuntimeBundle) {
  runtime.proc.send(
    JSON.stringify({
      frb: {
        ...frb,
        disabled_features: {},
      },
    })
  );

  while (true) {
    if (runtime.done) return;
    await sleep(100);
  }
  return;
}

describe("FunctionsEmulator-Runtime (new)", () => {
  describe("Stubs, Mocks, and Helpers", () => {
    let runtime: Runtime | undefined;

    afterEach(() => {
      runtime?.proc.kill(9);
      runtime = undefined;
    });

    describe("_InitializeNetworkFiltering", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("http").get("http://example.com", resolve);
                });
              }),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.sysMsg["unidentified-network-access"]?.length).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://example.com", resolve);
                });
              }),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.sysMsg["unidentified-network-access"]?.length).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing Google API requests", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://storage.googleapis.com", resolve);
                });
              }),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.sysMsg["googleapis-network-access"]?.length).to.gte(1);
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {}),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.sysMsg["default-admin-app-used"]?.length).to.gte(1);
      }).timeout(TIMEOUT_MED);

      it("should provide a stubbed app with custom options", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp({ custom: true });
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {}),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.sysMsg["default-admin-app-used"]?.length).to.gte(1);
        expect(runtime.sysMsg["default-admin-app-used"]?.join(" ")).to.match(/"custom":true/);
      }).timeout(TIMEOUT_MED);

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp(); // We still need to initialize default for snapshots
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {}),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.sysMsg["non-default-admin-app-used"]?.length).to.gte(1);
      }).timeout(TIMEOUT_MED);

      it("should route all sub-fields accordingly", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                console.log(
                  JSON.stringify(require("firebase-admin").firestore.FieldValue.increment(4))
                );
                return Promise.resolve();
              }),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
        expect(runtime.stdout.join(" ")).to.match(/{"operand":4}/);
      }).timeout(TIMEOUT_MED);


      it("should expose Firestore prod when the emulator is not running", async () => {
        runtime = await startRuntime("functionId", "event", () => {
          const admin = require("firebase-admin")
          admin.initializeApp();
          return {
            functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
              return Promise.resolve();
            }),
          };
        });
        await triggerRuntime(runtime, FunctionRuntimeBundles.onCreate);
      }).timeout(TIMEOUT_MED);
    });
  });
});

describe("FunctionsEmulator-Runtime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onCreate,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onCreate(async () => {
                  await new Promise((resolve) => {
                    require("http").get("http://example.com", resolve);
                  });
                }),
            };
          },
          "event"
        );

        const logs = await countLogEntries(worker);
        expect(logs["unidentified-network-access"]).to.gte(1);
        worker.runtime.shutdown();
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onCreate,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onCreate(async () => {
                  await new Promise((resolve) => {
                    require("https").get("https://example.com", resolve);
                  });
                }),
            };
          },
          "event"
        );

        const logs = await countLogEntries(worker);
        expect(logs["unidentified-network-access"]).to.gte(1);

        worker.runtime.shutdown();
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing Google API requests", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onCreate,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onCreate(async () => {
                  await new Promise((resolve) => {
                    require("https").get("https://storage.googleapis.com", resolve);
                  });
                }),
            };
          },
          "event"
        );

        const logs = await countLogEntries(worker);
        expect(logs["googleapis-network-access"]).to.gte(1);
        worker.runtime.shutdown();
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      let emulatorRegistryStub: sinon.SinonStub;

      beforeEach(() => {
        emulatorRegistryStub = sinon.stub(registry.EmulatorRegistry, "getInfo").returns(undefined);
      });

      afterEach(() => {
        emulatorRegistryStub.restore();
      });

      it("should expose Firestore prod when the emulator is not running", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();

            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(admin.firestore()._settings);
                return Promise.resolve();
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.be.undefined;
        expect(info.port).to.be.undefined;
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed Firestore when the emulator is running", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        emulatorRegistryStub.withArgs(Emulators.FIRESTORE).returns({
          name: Emulators.DATABASE,
          host: "localhost",
          port: 9090,
        });

        const worker = await invokeFunction(
          frb,
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();

            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(admin.firestore()._settings);
                return Promise.resolve();
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.eq("localhost");
        expect(info.port).to.eq(9090);
      }).timeout(TIMEOUT_MED);

      it("should expose RTDB prod when the emulator is not running", async () => {
        const frb = FunctionRuntimeBundles.onRequest;

        const worker = await invokeFunction(
          frb,
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();

            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json({
                  url: admin.database().ref().toString(),
                });
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("https://fake-project-id-default-rtdb.firebaseio.com/");
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed RTDB when the emulator is running", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        emulatorRegistryStub.withArgs(Emulators.DATABASE).returns({
          name: Emulators.DATABASE,
          host: "localhost",
          port: 9090,
        });

        const worker = await invokeFunction(
          frb,
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();

            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json({
                  url: admin.database().ref().toString(),
                });
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("http://localhost:9090/");
      }).timeout(TIMEOUT_MED);

      it("should return an emulated databaseURL when RTDB emulator is running", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        emulatorRegistryStub.withArgs(Emulators.DATABASE).returns({
          name: Emulators.DATABASE,
          host: "localhost",
          port: 9090,
        });

        const worker = await invokeFunction(
          frb,
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();

            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(JSON.parse(process.env.FIREBASE_CONFIG!));
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.databaseURL).to.eql(`http://localhost:9090/?ns=fake-project-id-default-rtdb`);
      }).timeout(TIMEOUT_MED);

      it("should return a real databaseURL when RTDB emulator is not running", async () => {
        const frb = cloneDeep(FunctionRuntimeBundles.onRequest);
        const worker = await invokeFunction(
          frb,
          () => {
            const admin = require("firebase-admin");
            admin.initializeApp();

            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(JSON.parse(process.env.FIREBASE_CONFIG!));
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.databaseURL).to.eql("https://fake-project-id-default-rtdb.firebaseio.com");
      }).timeout(TIMEOUT_MED);
    });
  });

  describe("_InitializeFunctionsConfigHelper()", () => {
    before(async () => {
      await fs.writeFile(
        MODULE_ROOT + "/.runtimeconfig.json",
        '{"real":{"exist":"already exists" }}'
      );
    });

    after(async () => {
      await fs.unlink(MODULE_ROOT + "/.runtimeconfig.json");
    });

    it("should tell the user if they've accessed a non-existent function field", async () => {
      const worker = await invokeFunction(
        FunctionRuntimeBundles.onCreate,
        () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                // Exists
                console.log(require("firebase-functions").config().real);

                // Does not exist
                console.log(require("firebase-functions").config().foo);
                console.log(require("firebase-functions").config().bar);
              }),
          };
        },
        "event"
      );

      const logs = await countLogEntries(worker);
      expect(logs["functions-config-missing-value"]).to.eq(2);
    }).timeout(TIMEOUT_MED);
  });

  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a GET request", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json({ from_trigger: true });
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);

        expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with form data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(req.body);
              }),
            };
          },
          "http"
        );

        const reqData = "name=sparky";
        const data = await callHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Content-Length": `${reqData.length}`,
            },
          },
          reqData
        );

        expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with JSON data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(req.body);
              }),
            };
          },
          "http"
        );

        const reqData = '{"name": "sparky"}';
        const data = await callHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Length": `${reqData.length}`,
            },
          },
          reqData
        );

        expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with text data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(req.body);
              }),
            };
          },
          "http"
        );

        const reqData = "name is sparky";
        const data = await callHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "text/plain",
              "Content-Length": `${reqData.length}`,
            },
          },
          reqData
        );

        expect(JSON.parse(data)).to.deep.equal("name is sparky");
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with any other type", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json(req.body);
              }),
            };
          },
          "http"
        );

        const reqData = "name is sparky";
        const data = await callHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "gibber/ish",
              "Content-Length": `${reqData.length}`,
            },
          },
          reqData
        );

        expect(JSON.parse(data).type).to.deep.equal("Buffer");
        expect(JSON.parse(data).data.length).to.deep.equal(14);
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request and store rawBody", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.send(req.rawBody);
              }),
            };
          },
          "http"
        );

        const reqData = "How are you?";
        const data = await callHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "gibber/ish",
              "Content-Length": `${reqData.length}`,
            },
          },
          reqData
        );

        expect(data).to.equal(reqData);
      }).timeout(TIMEOUT_MED);

      it("should forward request to Express app", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            const app = require("express")();
            app.all("/", (req: express.Request, res: express.Response) => {
              res.json({
                hello: req.header("x-hello"),
              });
            });
            return {
              functionId: require("firebase-functions").https.onRequest(app),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb, {
          headers: {
            "x-hello": "world",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hello: "world" });
      }).timeout(TIMEOUT_MED);

      it("should handle `x-forwarded-host`", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                res.json({ hostname: req.hostname });
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb, {
          headers: {
            "x-forwarded-host": "real-hostname",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hostname: "real-hostname" });
      }).timeout(TIMEOUT_MED);

      it("should report GMT time zone", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            return {
              functionId: require("firebase-functions").https.onRequest((req: any, res: any) => {
                const now = new Date();
                res.json({ offset: now.getTimezoneOffset() });
              }),
            };
          },
          "http"
        );

        const data = await callHTTPSFunction(worker, frb);
        expect(JSON.parse(data)).to.deep.equal({ offset: 0 });
      }).timeout(TIMEOUT_MED);
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onWrite,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onWrite((change: Change<DocumentSnapshot>) => {
                  console.log(
                    JSON.stringify({
                      before_exists: change.before.exists,
                      after_exists: change.after.exists,
                    })
                  );
                  return Promise.resolve();
                }),
            };
          },
          "event"
        );

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: false, after_exists: true });
        });

        const logs = await countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide Change for firestore.onUpdate()", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onUpdate,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onUpdate((change: Change<DocumentSnapshot>) => {
                  console.log(
                    JSON.stringify({
                      before_exists: change.before.exists,
                      after_exists: change.after.exists,
                    })
                  );
                  return Promise.resolve();
                }),
            };
          },
          "event"
        );

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: true, after_exists: true });
        });

        const logs = await countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onDelete()", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onDelete,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onDelete((snap: DocumentSnapshot) => {
                  console.log(
                    JSON.stringify({
                      snap_exists: snap.exists,
                    })
                  );
                  return Promise.resolve();
                }),
            };
          },
          "event"
        );

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onCreate()", async () => {
        const worker = await invokeFunction(
          FunctionRuntimeBundles.onWrite,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .firestore.document("test/test")
                .onCreate((snap: DocumentSnapshot) => {
                  console.log(
                    JSON.stringify({
                      snap_exists: snap.exists,
                    })
                  );
                  return Promise.resolve();
                }),
            };
          },
          "event"
        );

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });

    describe("Error handling", () => {
      it("Should handle regular functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest(() => {
                throw new Error("not a thing");
              }),
            };
          },
          "http"
        );

        const logs = countLogEntries(worker);

        try {
          await callHTTPSFunction(worker, frb);
        } catch (e: any) {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions").https.onRequest(async () => {
                return Promise.reject(new Error("not a thing"));
              }),
            };
          },
          "http"
        );

        const logs = countLogEntries(worker);

        try {
          await callHTTPSFunction(worker, frb);
        } catch {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async/runWith functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = await invokeFunction(
          frb,
          () => {
            require("firebase-admin").initializeApp();
            return {
              functionId: require("firebase-functions")
                .runWith({})
                .https.onRequest(async () => {
                  return Promise.reject(new Error("not a thing"));
                }),
            };
          },
          "http"
        );

        const logs = countLogEntries(worker);

        try {
          await callHTTPSFunction(worker, frb);
        } catch {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });
  });
});
