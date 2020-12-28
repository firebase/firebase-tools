import { expect } from "chai";
import * as _ from "lodash";
import * as express from "express";

import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/lib/providers/firestore";
import { EmulatorLog } from "../../emulator/types";
import { FunctionRuntimeBundles, TIMEOUT_LONG, TIMEOUT_MED, MODULE_ROOT } from "./fixtures";
import { FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";
import { IncomingMessage, request } from "http";
import { InvokeRuntimeOpts, FunctionsEmulator } from "../../emulator/functionsEmulator";
import { RuntimeWorker } from "../../emulator/functionsRuntimeWorker";
import { streamToString } from "../../utils";

const DO_NOTHING = () => {
  // do nothing.
};

const functionsEmulator = new FunctionsEmulator({
  projectId: "fake-project-id",
  functionsDir: MODULE_ROOT,
});
functionsEmulator.nodeBinary = process.execPath;

async function countLogEntries(worker: RuntimeWorker): Promise<{ [key: string]: number }> {
  const runtime = worker.runtime;
  const counts: { [key: string]: number } = {};

  runtime.events.on("log", (el: EmulatorLog) => {
    counts[el.type] = (counts[el.type] || 0) + 1;
  });

  await runtime.exit;
  return counts;
}

function invokeRuntimeWithFunctions(
  frb: FunctionsRuntimeBundle,
  triggers: () => {},
  opts?: InvokeRuntimeOpts
): RuntimeWorker {
  const serializedTriggers = triggers.toString();

  opts = opts || { nodeBinary: process.execPath };
  opts.ignore_warnings = true;
  opts.serializedTriggers = serializedTriggers;

  return functionsEmulator.invokeRuntime(frb, opts);
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
  options: { headers?: { [key: string]: string } } = {},
  requestData?: string
): Promise<string> {
  await worker.waitForSocketReady();

  if (!worker.lastArgs) {
    throw new Error("Can't talk to worker with undefined args");
  }

  const socketPath = worker.lastArgs.frb.socketPath;
  const path = `/${frb.projectId}/us-central1/${frb.triggerId}`;

  const res = await new Promise<IncomingMessage>((resolve, reject) => {
    const req = request(
      {
        method: "POST",
        headers: options.headers,
        socketPath,
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

describe("FunctionsEmulator-Runtime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  console.log(require("http").get.toString());
                  require("http").get("http://example.com", resolve);
                });
              }),
          };
        });

        const logs = await countLogEntries(worker);
        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://example.com", resolve);
                });
              }),
          };
        });

        const logs = await countLogEntries(worker);

        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing Google API requests", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  require("https").get("https://storage.googleapis.com", resolve);
                });
              }),
          };
        });

        const logs = await countLogEntries(worker);

        expect(logs["googleapis-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(DO_NOTHING),
          };
        });

        const logs = await countLogEntries(worker);
        expect(logs["default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide a stubbed app with custom options", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp({
            custom: true,
          });
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(DO_NOTHING),
          };
        });

        let foundMatch = false;
        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "SYSTEM" || el.type !== "default-admin-app-used") {
            return;
          }

          foundMatch = true;
          expect(el.data).to.eql({ opts: { custom: true } });
        });

        await worker.runtime.exit;
        expect(foundMatch).to.be.true;
      }).timeout(TIMEOUT_MED);

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp(); // We still need to initialize default for snapshots
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(DO_NOTHING),
          };
        });
        const logs = await countLogEntries(worker);
        expect(logs["non-default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should route all sub-fields accordingly", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(() => {
                console.log(
                  JSON.stringify(require("firebase-admin").firestore.FieldValue.increment(4))
                );
                return Promise.resolve();
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(JSON.parse(el.text)).to.deep.eq({ operand: 4 });
        });

        const logs = await countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should expose Firestore prod when the emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {};

        const worker = invokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
              return Promise.resolve();
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.be.undefined;
        expect(info.port).to.be.undefined;
      }).timeout(TIMEOUT_MED);

      it("should set FIRESTORE_EMULATOR_HOST when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {
          firestore: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = invokeRuntimeWithFunctions(frb, () => {
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                var: process.env.FIRESTORE_EMULATOR_HOST,
              });
              return Promise.resolve();
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const res = JSON.parse(data);

        expect(res.var).to.eql("localhost:9090");
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed Firestore when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {
          firestore: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = invokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
              return Promise.resolve();
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.eq("localhost");
        expect(info.port).to.eq(9090);
      }).timeout(TIMEOUT_MED);

      it("should expose RTDB prod when the emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {};

        const worker = invokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                url: admin
                  .database()
                  .ref()
                  .toString(),
              });
              return Promise.resolve();
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("https://fake-project-id-default-rtdb.firebaseio.com/");
      }).timeout(TIMEOUT_MED);

      it("should set FIREBASE_DATABASE_EMULATOR_HOST when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {
          database: {
            host: "localhost",
            port: 9000,
          },
        };

        const worker = invokeRuntimeWithFunctions(frb, () => {
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                var: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
              });
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const res = JSON.parse(data);

        expect(res.var).to.eql("localhost:9000");
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed RTDB when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {
          database: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = invokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                url: admin
                  .database()
                  .ref()
                  .toString(),
              });
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("http://localhost:9090/");
      }).timeout(TIMEOUT_MED);

      it("should return an emulated databaseURL when RTDB emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        frb.emulators = {
          database: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = invokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(JSON.parse(process.env.FIREBASE_CONFIG!));
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.databaseURL).to.eql(`http://localhost:9090/?ns=fake-project-id-default-rtdb`);
      }).timeout(TIMEOUT_MED);

      it("should return a real databaseURL when RTDB emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
        const worker = invokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(JSON.parse(process.env.FIREBASE_CONFIG!));
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.databaseURL).to.eql(frb.adminSdkConfig.databaseURL!);
      }).timeout(TIMEOUT_MED);
    });

    it("should set FIREBASE_AUTH_EMULATOR_HOST when the emulator is running", async () => {
      const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest);
      frb.emulators = {
        auth: {
          host: "localhost",
          port: 9099,
        },
      };

      const worker = invokeRuntimeWithFunctions(frb, () => {
        return {
          function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
            res.json({
              var: process.env.FIREBASE_AUTH_EMULATOR_HOST,
            });
          }),
        };
      });

      const data = await callHTTPSFunction(worker, frb);
      const res = JSON.parse(data);

      expect(res.var).to.eql("localhost:9099");
    }).timeout(TIMEOUT_MED);
  });

  describe("_InitializeFunctionsConfigHelper()", () => {
    it("should tell the user if they've accessed a non-existent function field", async () => {
      const worker = invokeRuntimeWithFunctions(
        FunctionRuntimeBundles.onCreate,
        () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
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
        {
          nodeBinary: process.execPath,
          env: {
            CLOUD_RUNTIME_CONFIG: JSON.stringify({
              real: { exist: "already exists" },
            }),
          },
        }
      );

      const logs = await countLogEntries(worker);
      expect(logs["functions-config-missing-value"]).to.eq(2);
    }).timeout(TIMEOUT_MED);
  });

  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a GET request", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({ from_trigger: true });
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);

        expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with form data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(req.body);
            }),
          };
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.send(req.rawBody);
            }),
          };
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          const app = require("express")();
          app.all("/", (req: express.Request, res: express.Response) => {
            res.json({
              hello: req.header("x-hello"),
            });
          });
          return {
            function_id: require("firebase-functions").https.onRequest(app),
          };
        });

        const data = await callHTTPSFunction(worker, frb, {
          headers: {
            "x-hello": "world",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hello: "world" });
      }).timeout(TIMEOUT_MED);

      it("should handle `x-forwarded-host`", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({ hostname: req.hostname });
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb, {
          headers: {
            "x-forwarded-host": "real-hostname",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hostname: "real-hostname" });
      }).timeout(TIMEOUT_MED);

      it("should report GMT time zone", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = invokeRuntimeWithFunctions(frb, () => {
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              const now = new Date();
              res.json({ offset: now.getTimezoneOffset() });
            }),
          };
        });

        const data = await callHTTPSFunction(worker, frb);
        expect(JSON.parse(data)).to.deep.equal({ offset: 0 });
      }).timeout(TIMEOUT_MED);
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
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
        });

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
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onUpdate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
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
        });

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
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onDelete, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
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
        });

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
        const worker = invokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
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
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              throw new Error("not a thing");
            }),
          };
        });

        const logs = countLogEntries(worker);

        try {
          await callHTTPSFunction(worker, frb);
        } catch (e) {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                await Promise.resolve(); // Required `await` for `async`.
                return Promise.reject(new Error("not a thing"));
              }
            ),
          };
        });

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
        const worker = invokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .runWith({})
              .https.onRequest(async (req: any, res: any) => {
                await Promise.resolve(); // Required `await` for `async`.
                return Promise.reject(new Error("not a thing"));
              }),
          };
        });

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
