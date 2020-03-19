import { expect } from "chai";
import { InvokeRuntimeOpts, FunctionsEmulator } from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";
import { FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";
import { RuntimeWorker } from "../../emulator/functionsRuntimeWorker";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/lib/providers/firestore";
import { FunctionRuntimeBundles, TIMEOUT_LONG, TIMEOUT_MED, MODULE_ROOT } from "./fixtures";
import * as request from "request";
import * as express from "express";
import * as _ from "lodash";

const functionsEmulator = new FunctionsEmulator({
  projectId: "fake-project-id",
  functionsDir: MODULE_ROOT,
});
functionsEmulator.nodeBinary = process.execPath;

async function _countLogEntries(worker: RuntimeWorker): Promise<{ [key: string]: number }> {
  const runtime = worker.runtime;
  const counts: { [key: string]: number } = {};

  runtime.events.on("log", (el: EmulatorLog) => {
    counts[el.type] = (counts[el.type] || 0) + 1;
  });

  await runtime.exit;
  return counts;
}

function InvokeRuntimeWithFunctions(
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
async function CallHTTPSFunction(
  worker: RuntimeWorker,
  frb: FunctionsRuntimeBundle,
  options: any = {},
  requestData?: string
): Promise<string> {
  await worker.waitForSocketReady();

  const dataPromise = new Promise<string>((resolve, reject) => {
    const path = `/${frb.projectId}/us-central1/${frb.triggerId}`;
    const requestOptions: request.CoreOptions = {
      method: "POST",
      ...options,
    };

    if (requestData) {
      requestOptions.body = requestData;
    }

    if (!worker.lastArgs) {
      throw new Error("Can't talk to worker with undefined args");
    }

    const socketPath = worker.lastArgs.frb.socketPath;
    request(`http://unix:${socketPath}:${path}`, requestOptions, (err, res, body) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(body);
    });
  });

  const result = await dataPromise;
  await worker.runtime.exit;

  return result;
}

describe("FunctionsEmulator-Runtime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await new Promise((resolve) => {
                  // tslint:disable-next-line:no-console
                  console.log(require("http").get.toString());
                  require("http").get("http://example.com", resolve);
                });
              }),
          };
        });

        const logs = await _countLogEntries(worker);
        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        const logs = await _countLogEntries(worker);

        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing Google API requests", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        const logs = await _countLogEntries(worker);

        expect(logs["googleapis-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });

        const logs = await _countLogEntries(worker);
        expect(logs["default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp(); // We still need to initialize default for snapshots
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });
        const logs = await _countLogEntries(worker);
        expect(logs["non-default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should route all sub-fields accordingly", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                // tslint:disable-next-line:no-console
                console.log(
                  JSON.stringify(require("firebase-admin").firestore.FieldValue.increment(4))
                );
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(JSON.parse(el.text)).to.deep.eq({ operand: 4 });
        });

        const logs = await _countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should expose Firestore prod when the emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.emulators = {};

        const worker = InvokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
            }),
          };
        });

        const data = await CallHTTPSFunction(worker, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.be.undefined;
        expect(info.port).to.be.undefined;
      }).timeout(TIMEOUT_MED);

      it("should set FIRESTORE_EMULATOR_HOST when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.emulators = {
          firestore: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = InvokeRuntimeWithFunctions(frb, () => {
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                var: process.env.FIRESTORE_EMULATOR_HOST,
              });
            }),
          };
        });

        const data = await CallHTTPSFunction(worker, frb);
        const res = JSON.parse(data);

        expect(res.var).to.eql("localhost:9090");
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed Firestore when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.emulators = {
          firestore: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = InvokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
            }),
          };
        });

        const data = await CallHTTPSFunction(worker, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.eq("localhost");
        expect(info.port).to.eq(9090);
      }).timeout(TIMEOUT_MED);

      it("should expose RTDB prod when the emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.emulators = {};

        const worker = InvokeRuntimeWithFunctions(frb, () => {
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

        const data = await CallHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("https://fake-project-id.firebaseio.com/");
      }).timeout(TIMEOUT_MED);

      it("should set FIREBASE_DATABASE_EMULATOR_HOST when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.emulators = {
          database: {
            host: "localhost",
            port: 9000,
          },
        };

        const worker = InvokeRuntimeWithFunctions(frb, () => {
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                var: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
              });
            }),
          };
        });

        const data = await CallHTTPSFunction(worker, frb);
        const res = JSON.parse(data);

        expect(res.var).to.eql("localhost:9000");
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed RTDB when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.emulators = {
          database: {
            host: "localhost",
            port: 9090,
          },
        };

        const worker = InvokeRuntimeWithFunctions(frb, () => {
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

        const data = await CallHTTPSFunction(worker, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("http://localhost:9090/");
      }).timeout(TIMEOUT_MED);

      it("should merge .initializeApp arguments from user", async () => {
        // This test causes very odd behavior in Travis, for now we'll disable it in CI until we can investigate
        if (process.env.CI) {
          return;
        }

        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          admin.initializeApp({
            databaseURL: "fake-app-id.firebaseio.com",
          });

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async (snap: any, ctx: any) => {
                admin
                  .database()
                  .ref("write-test")
                  .set({
                    date: new Date(),
                  });
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(
            el.text.indexOf(
              "Please ensure that you spelled the name of your " +
                "Firebase correctly (https://fake-app-id.firebaseio.com)"
            )
          ).to.gte(0);
          worker.runtime.kill();
        });

        await worker.runtime.exit;
      }).timeout(TIMEOUT_MED);
    });

    describe("_InitializeFunctionsConfigHelper()", () => {
      it("should tell the user if they've accessed a non-existent function field", async () => {
        const worker = InvokeRuntimeWithFunctions(
          FunctionRuntimeBundles.onCreate,
          () => {
            require("firebase-admin").initializeApp();
            return {
              function_id: require("firebase-functions")
                .firestore.document("test/test")
                .onCreate(async () => {
                  /* tslint:disable:no-console */
                  console.log(require("firebase-functions").config().doesnt.exist);
                  console.log(require("firebase-functions").config().does.exist);
                  console.log(require("firebase-functions").config().also_doesnt.exist);
                }),
            };
          },
          {
            nodeBinary: process.execPath,
            env: {
              CLOUD_RUNTIME_CONFIG: JSON.stringify({
                does: { exist: "already exists" },
              }),
            },
          }
        );

        const logs = await _countLogEntries(worker);
        expect(logs["functions-config-missing-value"]).to.eq(2);
      }).timeout(TIMEOUT_MED);
    });
  });

  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a GET request", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json({ from_trigger: true });
              }
            ),
          };
        });

        const data = await CallHTTPSFunction(worker, frb);

        expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with form data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        const reqData = "name=sparky";
        const data = await CallHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Content-Length": reqData.length,
            },
          },
          reqData
        );

        expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with JSON data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        const reqData = '{"name": "sparky"}';
        const data = await CallHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "application/json",
              "Content-Length": reqData.length,
            },
          },
          reqData
        );

        expect(JSON.parse(data)).to.deep.equal({ name: "sparky" });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with text data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        const reqData = "name is sparky";
        const data = await CallHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "text/plain",
              "Content-Length": reqData.length,
            },
          },
          reqData
        );

        expect(JSON.parse(data)).to.deep.equal("name is sparky");
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with any other type", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json(req.body);
              }
            ),
          };
        });

        const reqData = "name is sparky";
        const data = await CallHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "gibber/ish",
              "Content-Length": reqData.length,
            },
          },
          reqData
        );

        expect(JSON.parse(data).type).to.deep.equal("Buffer");
        expect(JSON.parse(data).data.length).to.deep.equal(14);
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request and store rawBody", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.send(req.rawBody);
              }
            ),
          };
        });

        const reqData = "How are you?";
        const data = await CallHTTPSFunction(
          worker,
          frb,
          {
            headers: {
              "Content-Type": "gibber/ish",
              "Content-Length": reqData.length,
            },
          },
          reqData
        );

        expect(data).to.equal(reqData);
      }).timeout(TIMEOUT_MED);

      it("should forward request to Express app", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
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

        const data = await CallHTTPSFunction(worker, frb, {
          headers: {
            "x-hello": "world",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hello: "world" });
      }).timeout(TIMEOUT_MED);

      it("should handle `x-forwarded-host`", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json({ hostname: req.hostname });
              }
            ),
          };
        });

        const data = await CallHTTPSFunction(worker, frb, {
          headers: {
            "x-forwarded-host": "real-hostname",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hostname: "real-hostname" });
      }).timeout(TIMEOUT_MED);
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onWrite(async (change: Change<DocumentSnapshot>) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    before_exists: change.before.exists,
                    after_exists: change.after.exists,
                  })
                );
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: false, after_exists: true });
        });

        const logs = await _countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide Change for firestore.onUpdate()", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onUpdate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onUpdate(async (change: Change<DocumentSnapshot>) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    before_exists: change.before.exists,
                    after_exists: change.after.exists,
                  })
                );
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: true, after_exists: true });
        });

        const logs = await _countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onDelete()", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onDelete, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onDelete(async (snap: DocumentSnapshot) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    snap_exists: snap.exists,
                  })
                );
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await _countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onCreate()", async () => {
        const worker = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async (snap: DocumentSnapshot) => {
                /* tslint:disable:no-console */
                console.log(
                  JSON.stringify({
                    snap_exists: snap.exists,
                  })
                );
              }),
          };
        });

        worker.runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await _countLogEntries(worker);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });

    describe("Error handling", () => {
      it("Should handle regular functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              (global as any)["not a thing"]();
            }),
          };
        });

        const logs = _countLogEntries(worker);

        try {
          await CallHTTPSFunction(worker, frb);
        } catch (e) {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }
            ),
          };
        });

        const logs = _countLogEntries(worker);

        try {
          await CallHTTPSFunction(worker, frb);
        } catch {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async/runWith functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const worker = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .runWith({})
              .https.onRequest(async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }),
          };
        });

        const logs = _countLogEntries(worker);

        try {
          await CallHTTPSFunction(worker, frb);
        } catch {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });
  });
});
