import { expect } from "chai";
import { FunctionsRuntimeInstance, InvokeRuntime } from "../../emulator/functionsEmulator";
import { EmulatorLog } from "../../emulator/types";
import { request } from "http";
import { FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";

const FunctionRuntimeBundles = {
  onCreate: {
    mode: "BACKGROUND",
    ports: {
      firestore: 8080,
    },
    cwd: "",
    proto: {
      data: {
        value: {
          name: "projects/fir-codelab-nyk/databases/(default)/documents/test/test",
          fields: {
            when: {
              timestampValue: "2019-04-15T16:55:48.150Z",
            },
          },
          createTime: "2019-04-15T16:56:13.737Z",
          updateTime: "2019-04-15T16:56:13.737Z",
        },
        updateMask: {},
      },
      context: {
        eventId: "7ebfb089-f549-4e1f-8312-fe843efc8be7",
        timestamp: "2019-04-15T16:56:13.737Z",
        eventType: "providers/cloud.firestore/eventTypes/document.create",
        resource: {
          name: "projects/fir-codelab-nyk/databases/(default)/documents/test/test",
          service: "firestore.googleapis.com",
        },
      },
    },
    triggerId: "function_id",
    projectId: "fir-codelab-nyk",
  } as FunctionsRuntimeBundle,
  onRequest: {
    mode: "HTTPS",
    ports: {
      firestore: 8080,
    },
    cwd: "",
    triggerId: "function_id",
    projectId: "fir-codelab-nyk",
  } as FunctionsRuntimeBundle,
};

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

function _is_verbose(runtime: FunctionsRuntimeInstance): void {
  runtime.events.on("log", (el: EmulatorLog) => {
    process.stdout.write(el.toString() + "\n");
  });
}

describe("FunctionsEmulatorRuntime", () => {
  describe("Stubs, Mocks, and Helpers (aka Magic, Glee, and Awesomeness)", () => {
    describe("_InitializeNetworkFiltering(...)", () => {
      it("should log outgoing HTTPS requests", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                await require("node-fetch")("https://jpg.cool/fish.gif");
                await new Promise((resolve) => {
                  require("http").get("http://example.com", resolve);
                });
                await new Promise((resolve) => {
                  require("https").get("https://example.com", resolve);
                });
              }),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
          serializedTriggers,
        });
        const logs = await _countLogEntries(runtime);

        // In Node 6 we get 4 events here, Node 8+ gets 3 because of changes to
        // HTTP libraries, either is fine because we'll whitelist / deny the request
        // after the first prompt.
        expect(logs["unidentified-network-access"]).to.gte(3);
        expect(logs["googleapis-network-access"]).to.gte(1);
      });
    });

    describe("_InitializeFirebaseAdminStubs(...)", () => {
      it("should provide stubbed default app from initializeApp", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                require("firebase-admin").initializeApp();
              }),
          };
        }).toString();

        const logs = await _countLogEntries(
          InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, { serializedTriggers })
        );

        expect(logs["default-admin-app-used"]).to.eq(1);
      });

      it("should provide non-stubbed non-default app from initializeApp", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions")
              .firestore.document("test/test")
              .onCreate(async () => {
                require("firebase-admin").initializeApp({}, "non-default");
              }),
          };
        }).toString();

        const logs = await _countLogEntries(
          InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, { serializedTriggers })
        );

        expect(logs["non-default-admin-app-used"]).to.eq(1);
      });

      it("should redirect Firestore write to emulator", async () => {
        const serializedTriggers = (() => {
          return {
            function_id: require("firebase-functions").https.onRequest(
              async (req: any, res: any) => {
                /* tslint:disable:no-console */
                const admin = require("firebase-admin");
                admin.initializeApp();

                try {
                  await admin
                    .firestore()
                    .collection("test")
                    .add({ date: new Date() });
                  res.json({ from_trigger: true });
                } catch (e) {
                  res.json({ error: e.message });
                }
              }
            ),
          };
        }).toString();

        const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onRequest, {
          serializedTriggers,
        });

        await runtime.ready;

        await new Promise((resolve) => {
          request(
            {
              socketPath: runtime.metadata.socketPath,
              path: "/",
            },
            (res) => {
              let data = "";
              res.on("data", (chunk) => (data += chunk));
              res.on("end", () => {
                expect(JSON.parse(data)).to.deep.equal({ error: "14 UNAVAILABLE: Connect Failed" });
                resolve();
              });
            }
          ).end();
        });

        await runtime.exit;
      });
    });

    describe("_InitializeFunctionsConfigHelper()", () => {
      it("should tell the user if they've accessed a non-existent function field", async () => {
        const serializedTriggers = (() => {
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
        }).toString();

        const logs = await _countLogEntries(
          InvokeRuntime(process.execPath, FunctionRuntimeBundles.onCreate, {
            serializedTriggers,
            env: {
              CLOUD_RUNTIME_CONFIG: JSON.stringify({ does: { exist: "already exists" } }),
            },
          })
        );

        expect(logs["functions-config-missing-value"]).to.eq(2);
      });
    });
  });

  describe("Runtime", () => {
    it("should handle a single HTTP invocation", async () => {
      const serializedTriggers = (() => {
        return {
          function_id: require("firebase-functions").https.onRequest(async (req: any, res: any) => {
            /* tslint:disable:no-console */
            res.json({ from_trigger: true });
          }),
        };
      }).toString();

      const onRequestCopy = JSON.parse(
        JSON.stringify(FunctionRuntimeBundles.onRequest)
      ) as FunctionsRuntimeBundle;
      onRequestCopy.ports.firestore = 80800; // Set the port to something crazy to avoid conflict with live emulator
      const runtime = InvokeRuntime(process.execPath, onRequestCopy, {
        serializedTriggers,
      });

      await runtime.ready;

      await new Promise((resolve) => {
        request(
          {
            socketPath: runtime.metadata.socketPath,
            path: "/",
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
              resolve();
            });
          }
        ).end();
      });

      await runtime.exit;
    });

    it("should handle a simple write to Firestore", async () => {
      const serializedTriggers = (() => {
        return {
          function_id: require("firebase-functions").https.onRequest(async (req: any, res: any) => {
            /* tslint:disable:no-console */
            const admin = require("firebase-admin");
            admin.initializeApp();
            try {
              await admin
                .firestore()
                .collection("test")
                .add({ date: new Date() });
              res.json({ from_trigger: true });
            } catch (e) {
              res.json({ error: true });
            }
          }),
        };
      }).toString();

      const runtime = InvokeRuntime(process.execPath, FunctionRuntimeBundles.onRequest, {
        serializedTriggers,
      });

      await runtime.ready;

      await new Promise((resolve) => {
        request(
          {
            socketPath: runtime.metadata.socketPath,
            path: "/",
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              expect(JSON.parse(data)).to.deep.equal({ from_trigger: true });
              resolve();
            });
          }
        ).end();
      });

      await runtime.exit;
    });
  });
});
