import { expect } from "chai";
import {
  FunctionsRuntimeInstance,
  InvokeRuntime,
  InvokeRuntimeOpts,
} from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";
import { FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";
import { Change } from "firebase-functions";
import { DocumentSnapshot } from "firebase-functions/lib/providers/firestore";
import { FunctionRuntimeBundles, TIMEOUT_LONG, TIMEOUT_MED } from "./fixtures";
import * as request from "request";
import * as express from "express";
import * as _ from "lodash";

async function _countLogEntries(
  runtime: FunctionsRuntimeInstance
): Promise<{ [key: string]: number }> {
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
): FunctionsRuntimeInstance {
  const serializedTriggers = triggers.toString();

  opts = opts || {};
  opts.ignore_warnings = true;

  return InvokeRuntime(process.execPath, frb, {
    ...opts,
    serializedTriggers,
  });
}

/**
 * Three step process:
 *   1) Wait for the runtime to be ready.
 *   2) Call the runtime with the specified bundle and collect all data.
 *   3) Wait for the runtime to exit
 */
async function CallHTTPSFunction(
  runtime: FunctionsRuntimeInstance,
  frb: FunctionsRuntimeBundle,
  options: any = {},
  requestData?: string
): Promise<string> {
  await runtime.ready;
  const dataPromise = new Promise<string>((resolve, reject) => {
    const path = `/${frb.projectId}/us-central1/${frb.triggerId}`;
    const requestOptions: request.CoreOptions = {
      method: "POST",
      ...options,
    };

    if (requestData) {
      requestOptions.body = requestData;
    }

    request(
      `http://unix:${runtime.metadata.socketPath}:${path}`,
      requestOptions,
      (err, res, body) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(body);
      }
    );
  });

  const result = await dataPromise;
  await runtime.exit;

  return result;
}

describe("FunctionsEmulator-Runtime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing unknown HTTP requests via 'http'", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        const logs = await _countLogEntries(runtime);
        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing unknown HTTP requests via 'https'", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        const logs = await _countLogEntries(runtime);

        expect(logs["unidentified-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);

      it("should log outgoing Google API requests", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        const logs = await _countLogEntries(runtime);

        expect(logs["googleapis-network-access"]).to.gte(1);
      }).timeout(TIMEOUT_LONG);
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          require("firebase-admin").initializeApp(); // We still need to initialize default for snapshots
          require("firebase-admin").initializeApp({}, "non-default");
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });
        const logs = await _countLogEntries(runtime);
        expect(logs["non-default-admin-app-used"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should route all sub-fields accordingly", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(JSON.parse(el.text)).to.deep.eq({ operand: 4 });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide a stubbed Firestore through admin.firestore()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();
          const firestore = admin.firestore();

          // Need to use the Firestore object in order to trigger init.
          const ref = firestore.collection("foo").doc("bar");

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                return true;
              }),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["set-firestore-settings"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide a stubbed Firestore through app.firestore()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          const app = admin.initializeApp();
          const firestore = app.firestore();

          // Need to use the Firestore object in order to trigger init.
          const ref = firestore.collection("foo").doc("bar");

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                return true;
              }),
          };
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["set-firestore-settings"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide the same stubs through admin-global or through the default app", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onRequest, () => {
          const admin = require("firebase-admin");
          const app = admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json({
                appFirestoreSettings: app.firestore()._settings,
                adminFirestoreSettings: admin.firestore()._settings,
                appDatabaseRef: app
                  .database()
                  .ref()
                  .toString(),
                adminDatabaseRef: admin
                  .database()
                  .ref()
                  .toString(),
              });
            }),
          };
        });

        const data = await CallHTTPSFunction(runtime, FunctionRuntimeBundles.onRequest);

        const info = JSON.parse(data);
        expect(info.appFirestoreSettings).to.deep.eq(info.adminFirestoreSettings);
        expect(info.appDatabaseRef).to.eq(info.adminDatabaseRef);
      }).timeout(TIMEOUT_MED);

      it("should expose Firestore prod when the emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.ports = {};

        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
            }),
          };
        });

        const data = await CallHTTPSFunction(runtime, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.be.undefined;
        expect(info.port).to.be.undefined;
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed Firestore when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.ports = {
          firestore: 9090,
        };

        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();

          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              res.json(admin.firestore()._settings);
            }),
          };
        });

        const data = await CallHTTPSFunction(runtime, frb);
        const info = JSON.parse(data);

        expect(info.projectId).to.eql("fake-project-id");
        expect(info.servicePath).to.eq("localhost");
        expect(info.port).to.eq(9090);
      }).timeout(TIMEOUT_MED);

      it("should expose RTDB prod when the emulator is not running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.ports = {};

        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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

        const data = await CallHTTPSFunction(runtime, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("https://fake-project-id.firebaseio.com/");
      }).timeout(TIMEOUT_MED);

      it("should expose a stubbed RTDB when the emulator is running", async () => {
        const frb = _.cloneDeep(FunctionRuntimeBundles.onRequest) as FunctionsRuntimeBundle;
        frb.ports = {
          database: 9090,
        };

        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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

        const data = await CallHTTPSFunction(runtime, frb);
        const info = JSON.parse(data);
        expect(info.url).to.eql("http://localhost:9090/");
      }).timeout(TIMEOUT_MED);

      it("should merge .settings() with emulator settings", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
          const admin = require("firebase-admin");
          admin.initializeApp();
          admin.firestore().settings({
            timestampsInSnapshots: true,
          });

          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              // tslint:disable-next-line:no-empty
              .onCreate(async () => {}),
          };
        });

        runtime.events.on("log", (el: EmulatorLog) => {
          expect(el.text.indexOf("You can only call settings() once")).to.eq(-1);
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);

      it("should merge .initializeApp arguments from user", async () => {
        // This test causes very odd behavior in Travis, for now we'll disable it in CI until we can investigate
        if (process.env.CI) {
          return;
        }

        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onCreate, () => {
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

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(
            el.text.indexOf(
              "Please ensure that you spelled the name of your " +
                "Firebase correctly (https://fake-app-id.firebaseio.com)"
            )
          ).to.gte(0);
          runtime.kill();
        });

        await runtime.exit;
      }).timeout(TIMEOUT_MED);
    });

    describe("_InitializeFunctionsConfigHelper()", () => {
      it("should tell the user if they've accessed a non-existent function field", async () => {
        const runtime = InvokeRuntimeWithFunctions(
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
            env: {
              CLOUD_RUNTIME_CONFIG: JSON.stringify({
                does: { exist: "already exists" },
              }),
            },
          }
        );

        const logs = await _countLogEntries(runtime);
        expect(logs["functions-config-missing-value"]).to.eq(2);
      }).timeout(TIMEOUT_MED);
    });
  });

  describe("Runtime", () => {
    describe("HTTPS", () => {
      it("should handle a GET request", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json({ from_trigger: true });
              }
            ),
          };
        });

        const data = await CallHTTPSFunction(runtime, frb);

        expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
      }).timeout(TIMEOUT_MED);

      it("should handle a POST request with form data", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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
          runtime,
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
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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
          runtime,
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
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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
          runtime,
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
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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
          runtime,
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
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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
          runtime,
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
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
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

        const data = await CallHTTPSFunction(runtime, frb, {
          headers: {
            "x-hello": "world",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hello: "world" });
      }).timeout(TIMEOUT_MED);

      it("should handle `x-forwarded-host`", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                res.json({ hostname: req.hostname });
              }
            ),
          };
        });

        const data = await CallHTTPSFunction(runtime, frb, {
          headers: {
            "x-forwarded-host": "real-hostname",
          },
        });

        expect(JSON.parse(data)).to.deep.equal({ hostname: "real-hostname" });
      }).timeout(TIMEOUT_MED);
    });

    describe("Cloud Firestore", () => {
      it("should provide Change for firestore.onWrite()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
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

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }

          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: false, after_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide Change for firestore.onUpdate()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onUpdate, () => {
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

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ before_exists: true, after_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onDelete()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onDelete, () => {
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

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("should provide DocumentSnapshot for firestore.onCreate()", async () => {
        const runtime = InvokeRuntimeWithFunctions(FunctionRuntimeBundles.onWrite, () => {
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

        runtime.events.on("log", (el: EmulatorLog) => {
          if (el.level !== "USER") {
            return;
          }
          expect(JSON.parse(el.text)).to.deep.eq({ snap_exists: true });
        });

        const logs = await _countLogEntries(runtime);
        expect(logs["function-log"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });

    describe("Error handling", () => {
      it("Should handle regular functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest((req: any, res: any) => {
              (global as any)["not a thing"]();
            }),
          };
        });

        const logs = _countLogEntries(runtime);

        try {
          await CallHTTPSFunction(runtime, frb);
        } catch (e) {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }
            ),
          };
        });

        const logs = _countLogEntries(runtime);

        try {
          await CallHTTPSFunction(runtime, frb);
        } catch {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);

      it("Should handle async/runWith functions for Express handlers", async () => {
        const frb = FunctionRuntimeBundles.onRequest;
        const runtime = InvokeRuntimeWithFunctions(frb, () => {
          require("firebase-admin").initializeApp();
          return {
            function_id: require("firebase-functions")
              .runWith({})
              .https.onRequest(async (req: any, res: any) => {
                (global as any)["not a thing"]();
              }),
          };
        });

        const logs = _countLogEntries(runtime);

        try {
          await CallHTTPSFunction(runtime, frb);
        } catch {
          // No-op
        }

        expect((await logs)["runtime-error"]).to.eq(1);
      }).timeout(TIMEOUT_MED);
    });
  });
});
