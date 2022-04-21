import * as fs from "fs";

import { expect } from "chai";
import * as express from "express";
import * as sinon from "sinon";
import * as supertest from "supertest";
import * as winston from "winston";
import * as logform from "logform";
import * as path from "path";

import { EmulatedTriggerDefinition } from "../../src/emulator/functionsEmulatorShared";
import { FunctionsEmulator, InvokeRuntimeOpts } from "../../src/emulator/functionsEmulator";
import { Emulators } from "../../src/emulator/types";
import { RuntimeWorker } from "../../src/emulator/functionsRuntimeWorker";
import { TIMEOUT_LONG, TIMEOUT_MED, MODULE_ROOT } from "./fixtures";
import { logger } from "../../src/logger";
import * as registry from "../../src/emulator/registry";
import * as secretManager from "../../src/gcp/secretManager";

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

const functionsEmulator = new FunctionsEmulator({
  projectId: "fake-project-id",
  projectDir: MODULE_ROOT,
  emulatableBackends: [
    {
      functionsDir: MODULE_ROOT,
      env: {},
      secretEnv: [],
    },
  ],
  quiet: true,
});

const testBackend = {
  functionsDir: MODULE_ROOT,
  env: {},
  secretEnv: [],
  nodeBinary: process.execPath,
};

functionsEmulator.setTriggersForTesting(
  [
    {
      platform: "gcfv1",
      name: "function_id",
      id: "us-central1-function_id",
      region: "us-central1",
      entryPoint: "function_id",
      httpsTrigger: {},
      labels: {},
    },
    {
      platform: "gcfv1",
      name: "function_id",
      id: "europe-west2-function_id",
      region: "europe-west2",
      entryPoint: "function_id",
      httpsTrigger: {},
      labels: {},
    },
    {
      platform: "gcfv1",
      name: "function_id",
      id: "europe-west3-function_id",
      region: "europe-west3",
      entryPoint: "function_id",
      httpsTrigger: {},
      labels: {},
    },
    {
      platform: "gcfv1",
      name: "callable_function_id",
      id: "us-central1-callable_function_id",
      region: "us-central1",
      entryPoint: "callable_function_id",
      httpsTrigger: {},
      labels: {
        "deployment-callable": "true",
      },
    },
    {
      platform: "gcfv1",
      name: "nested-function_id",
      id: "us-central1-nested-function_id",
      region: "us-central1",
      entryPoint: "nested.function_id",
      httpsTrigger: {},
      labels: {},
    },
    {
      platform: "gcfv1",
      name: "secrets_function_id",
      id: "us-central1-secrets_function_id",
      region: "us-central1",
      entryPoint: "secrets_function_id",
      secretEnvironmentVariables: [
        {
          projectId: "fake-project-id",
          secret: "MY_SECRET",
          key: "MY_SECRET",
          version: "1",
        },
      ],
      httpsTrigger: {},
      labels: {},
    },
  ],
  testBackend
);

// TODO(samstern): This is an ugly way to just override the InvokeRuntimeOpts on each call
const invokeTrigger = functionsEmulator.invokeTrigger.bind(functionsEmulator);
function useFunctions(triggers: () => {}): void {
  const serializedTriggers = triggers.toString();

  // eslint-disable-next-line @typescript-eslint/unbound-method
  functionsEmulator.invokeTrigger = (
    trigger: EmulatedTriggerDefinition,
    proto?: any,
    runtimeOpts?: InvokeRuntimeOpts
  ): Promise<RuntimeWorker> => {
    return invokeTrigger(trigger, proto, {
      nodeBinary: process.execPath,
      serializedTriggers,
    });
  };
}

describe("FunctionsEmulator-Hub", () => {
  it("should route requests to /:project_id/us-central1/:trigger_id to default region HTTPS Function", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should route requests to /:project_id/:other-region/:trigger_id to the region's HTTPS Function", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions")
          .region("us-central1", "europe-west2")
          .https.onRequest((req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/europe-west2/function_id")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should 404 when a function doesn't exist in the region", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions")
          .region("us-central1", "europe-west2")
          .https.onRequest((req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-east1/function_id")
      .expect(404);
  }).timeout(TIMEOUT_LONG);

  it("should route requests to /:project_id/:region/:trigger_id/ to HTTPS Function", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id/")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should 404 when a function does not exist", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_dne")
      .expect(404);
  }).timeout(TIMEOUT_LONG);

  it("should properly route to a namespaced/grouped HTTPs function", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        nested: {
          function_id: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            }
          ),
        },
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/nested-function_id")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should route requests to /:project_id/:region/:trigger_id/a/b to HTTPS Function", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id/a/b")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/a/b");
      });
  }).timeout(TIMEOUT_LONG);

  it("should reject requests to a non-emulator path", async () => {
    useFunctions(() => {
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer()).get("/foo/bar/baz").expect(404);
  }).timeout(TIMEOUT_LONG);

  it("should rewrite req.path to hide /:project_id/:region/:trigger_id", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id/sub/route/a")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.eq("/sub/route/a");
      });
  }).timeout(TIMEOUT_LONG);

  it("should return the correct url, baseUrl, originalUrl for the root route", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({
              url: req.url,
              baseUrl: req.baseUrl,
              originalUrl: req.originalUrl,
            });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id")
      .expect(200)
      .then((res) => {
        expect(res.body.url).to.eq("/");
        expect(res.body.baseUrl).to.eq("");
        expect(res.body.originalUrl).to.eq("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should return the correct url, baseUrl, originalUrl with query params", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({
              url: req.url,
              baseUrl: req.baseUrl,
              originalUrl: req.originalUrl,
              query: req.query,
            });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id?a=1&b=2")
      .expect(200)
      .then((res) => {
        expect(res.body.url).to.eq("/?a=1&b=2");
        expect(res.body.baseUrl).to.eq("");
        expect(res.body.originalUrl).to.eq("/?a=1&b=2");
        expect(res.body.query).to.deep.eq({ a: "1", b: "2" });
      });
  }).timeout(TIMEOUT_LONG);

  it("should return the correct url, baseUrl, originalUrl for a subroute", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({
              url: req.url,
              baseUrl: req.baseUrl,
              originalUrl: req.originalUrl,
            });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id/sub/route/a")
      .expect(200)
      .then((res) => {
        expect(res.body.url).to.eq("/sub/route/a");
        expect(res.body.baseUrl).to.eq("");
        expect(res.body.originalUrl).to.eq("/sub/route/a");
      });
  }).timeout(TIMEOUT_LONG);

  it("should return the correct url, baseUrl, originalUrl for any region", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions")
          .region("europe-west3")
          .https.onRequest((req: express.Request, res: express.Response) => {
            res.json({
              url: req.url,
              baseUrl: req.baseUrl,
              originalUrl: req.originalUrl,
            });
          }),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/europe-west3/function_id")
      .expect(200)
      .then((res) => {
        expect(res.body.url).to.eq("/");
        expect(res.body.baseUrl).to.eq("");
        expect(res.body.originalUrl).to.eq("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should route request body", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json(req.body);
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .post("/fake-project-id/us-central1/function_id/sub/route/a")
      .send({ hello: "world" })
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({ hello: "world" });
      });
  }).timeout(TIMEOUT_LONG);

  it("should route query parameters", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json(req.query);
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id/sub/route/a?hello=world")
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({ hello: "world" });
      });
  }).timeout(TIMEOUT_LONG);

  it("should override callable auth", async () => {
    useFunctions(() => {
      return {
        callable_function_id: require("firebase-functions").https.onCall((data: any, ctx: any) => {
          return {
            auth: ctx.auth,
          };
        }),
      };
    });

    // For token info:
    // https://jwt.io/#debugger-io?token=eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsInVzZXJfaWQiOiJTbW56OE8xcmxkZmptZHg4QVJVdE12WG1tdzYyIiwic3ViIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsImlhdCI6MTU4NTA1MzI2NCwiZXhwIjoxNTg1MDU2ODY0LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImFub255bW91cyJ9fQ.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw
    await supertest(functionsEmulator.createHubServer())
      .post("/fake-project-id/us-central1/callable_function_id")
      .set({
        "Content-Type": "application/json",
        Authorization:
          "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsInVzZXJfaWQiOiJTbW56OE8xcmxkZmptZHg4QVJVdE12WG1tdzYyIiwic3ViIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsImlhdCI6MTU4NTA1MzI2NCwiZXhwIjoxNTg1MDU2ODY0LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImFub255bW91cyJ9fQ.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw",
      })
      .send({ data: {} })
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({
          result: {
            auth: {
              uid: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
              token: {
                provider_id: "anonymous",
                iss: "https://securetoken.google.com/fir-dumpster",
                aud: "fir-dumpster",
                auth_time: 1585053264,
                user_id: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
                sub: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
                uid: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
                iat: 1585053264,
                exp: 1585056864,
                firebase: {
                  identities: {},
                  sign_in_provider: "anonymous",
                },
              },
            },
          },
        });
      });
  }).timeout(TIMEOUT_LONG);

  it("should override callable auth with unicode", async () => {
    useFunctions(() => {
      return {
        callable_function_id: require("firebase-functions").https.onCall((data: any, ctx: any) => {
          return {
            auth: ctx.auth,
          };
        }),
      };
    });

    // For token info:
    // https://jwt.io/#debugger-io?token=eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsIm5hbWUiOiLlsbHnlLDlpKrpg44iLCJ1c2VyX2lkIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsInN1YiI6IlNtbno4TzFybGRmam1keDhBUlV0TXZYbW13NjIiLCJpYXQiOjE1ODUwNTMyNjQsImV4cCI6MTU4NTA1Njg2NCwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJhbm9ueW1vdXMifX0.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw
    await supertest(functionsEmulator.createHubServer())
      .post("/fake-project-id/us-central1/callable_function_id")
      .set({
        "Content-Type": "application/json",
        Authorization:
          "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsIm5hbWUiOiLlsbHnlLDlpKrpg44iLCJ1c2VyX2lkIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsInN1YiI6IlNtbno4TzFybGRmam1keDhBUlV0TXZYbW13NjIiLCJpYXQiOjE1ODUwNTMyNjQsImV4cCI6MTU4NTA1Njg2NCwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJhbm9ueW1vdXMifX0.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw",
      })
      .send({ data: {} })
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({
          result: {
            auth: {
              uid: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
              token: {
                provider_id: "anonymous",
                iss: "https://securetoken.google.com/fir-dumpster",
                aud: "fir-dumpster",
                auth_time: 1585053264,
                name: "山田太郎",
                user_id: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
                sub: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
                uid: "Smnz8O1rldfjmdx8ARUtMvXmmw62",
                iat: 1585053264,
                exp: 1585056864,
                firebase: {
                  identities: {},
                  sign_in_provider: "anonymous",
                },
              },
            },
          },
        });
      });
  }).timeout(TIMEOUT_LONG);

  it("should override callable auth with a poorly padded ID Token", async () => {
    useFunctions(() => {
      return {
        callable_function_id: require("firebase-functions").https.onCall((data: any, ctx: any) => {
          return {
            auth: ctx.auth,
          };
        }),
      };
    });

    // For token info:
    // https://jwt.io/#debugger-io?token=eyJhbGciOiJub25lIiwia2lkIjoiZmFrZWtpZCJ9.eyJ1aWQiOiJhbGljZSIsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS5jb20iLCJpYXQiOjAsInN1YiI6ImFsaWNlIn0%3D.
    await supertest(functionsEmulator.createHubServer())
      .post("/fake-project-id/us-central1/callable_function_id")
      .set({
        "Content-Type": "application/json",
        Authorization:
          "Bearer eyJhbGciOiJub25lIiwia2lkIjoiZmFrZWtpZCJ9.eyJ1aWQiOiJhbGljZSIsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS5jb20iLCJpYXQiOjAsInN1YiI6ImFsaWNlIn0=.",
      })
      .send({ data: {} })
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({
          result: {
            auth: {
              uid: "alice",
              token: {
                uid: "alice",
                email: "alice@example.com",
                iat: 0,
                sub: "alice",
              },
            },
          },
        });
      });
  }).timeout(TIMEOUT_LONG);

  it("should preserve the Authorization header for callable auth", async () => {
    useFunctions(() => {
      return {
        callable_function_id: require("firebase-functions").https.onCall((data: any, ctx: any) => {
          return {
            header: ctx.rawRequest.headers["authorization"],
          };
        }),
      };
    });

    const authHeader =
      "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsInVzZXJfaWQiOiJTbW56OE8xcmxkZmptZHg4QVJVdE12WG1tdzYyIiwic3ViIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsImlhdCI6MTU4NTA1MzI2NCwiZXhwIjoxNTg1MDU2ODY0LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImFub255bW91cyJ9fQ.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw";

    // For token info:
    // https://jwt.io/#debugger-io?token=eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsInVzZXJfaWQiOiJTbW56OE8xcmxkZmptZHg4QVJVdE12WG1tdzYyIiwic3ViIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsImlhdCI6MTU4NTA1MzI2NCwiZXhwIjoxNTg1MDU2ODY0LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImFub255bW91cyJ9fQ.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw
    await supertest(functionsEmulator.createHubServer())
      .post("/fake-project-id/us-central1/callable_function_id")
      .set({
        "Content-Type": "application/json",
        Authorization: authHeader,
      })
      .send({ data: {} })
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({
          result: {
            header: authHeader,
          },
        });
      });
  }).timeout(TIMEOUT_LONG);

  it("should respond to requests to /backends to with info about the running backends", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/backends")
      .expect(200)
      .then((res) => {
        // TODO(b/216642962): Add tests for this endpoint that validate behavior when there are Extensions running
        const expectedDirectory = path.resolve(`${__dirname}/../..`);
        expect(res.body.backends).to.deep.equal([
          {
            directory: expectedDirectory,
            env: {},
            functionTriggers: [
              {
                entryPoint: "function_id",
                httpsTrigger: {},
                id: "us-central1-function_id",
                labels: {},
                name: "function_id",
                platform: "gcfv1",
                region: "us-central1",
              },
              {
                entryPoint: "function_id",
                httpsTrigger: {},
                id: "europe-west2-function_id",
                labels: {},
                name: "function_id",
                platform: "gcfv1",
                region: "europe-west2",
              },
              {
                entryPoint: "function_id",
                httpsTrigger: {},
                id: "europe-west3-function_id",
                labels: {},
                name: "function_id",
                platform: "gcfv1",
                region: "europe-west3",
              },
              {
                entryPoint: "callable_function_id",
                httpsTrigger: {},
                id: "us-central1-callable_function_id",
                labels: {
                  "deployment-callable": "true",
                },
                name: "callable_function_id",
                platform: "gcfv1",
                region: "us-central1",
              },
              {
                entryPoint: "nested.function_id",
                httpsTrigger: {},
                id: "us-central1-nested-function_id",
                labels: {},
                name: "nested-function_id",
                platform: "gcfv1",
                region: "us-central1",
              },
              {
                entryPoint: "secrets_function_id",
                httpsTrigger: {},
                id: "us-central1-secrets_function_id",
                labels: {},
                name: "secrets_function_id",
                platform: "gcfv1",
                region: "us-central1",
                secretEnvironmentVariables: [
                  {
                    key: "MY_SECRET",
                    projectId: "fake-project-id",
                    secret: "MY_SECRET",
                    version: "1",
                  },
                ],
              },
            ],
          },
        ]);
      });
  }).timeout(TIMEOUT_LONG);

  describe("environment variables", () => {
    let emulatorRegistryStub: sinon.SinonStub;

    beforeEach(() => {
      emulatorRegistryStub = sinon.stub(registry.EmulatorRegistry, "getInfo").returns(undefined);
    });

    afterEach(() => {
      emulatorRegistryStub.restore();
    });

    it("should set FIREBASE_DATABASE_EMULATOR_HOST when the emulator is running", async () => {
      emulatorRegistryStub.withArgs(Emulators.DATABASE).returns({
        name: Emulators.DATABASE,
        host: "localhost",
        port: 9090,
      });

      useFunctions(() => {
        return {
          function_id: require("firebase-functions").https.onRequest(
            (_req: express.Request, res: express.Response) => {
              res.json({
                var: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
              });
            }
          ),
        };
      });

      await supertest(functionsEmulator.createHubServer())
        .get("/fake-project-id/us-central1/function_id")
        .expect(200)
        .then((res) => {
          expect(res.body.var).to.eql("localhost:9090");
        });
    }).timeout(TIMEOUT_MED);

    it("should set FIRESTORE_EMULATOR_HOST when the emulator is running", async () => {
      emulatorRegistryStub.withArgs(Emulators.FIRESTORE).returns({
        name: Emulators.FIRESTORE,
        host: "localhost",
        port: 9090,
      });

      useFunctions(() => {
        return {
          function_id: require("firebase-functions").https.onRequest(
            (_req: express.Request, res: express.Response) => {
              res.json({
                var: process.env.FIRESTORE_EMULATOR_HOST,
              });
            }
          ),
        };
      });

      await supertest(functionsEmulator.createHubServer())
        .get("/fake-project-id/us-central1/function_id")
        .expect(200)
        .then((res) => {
          expect(res.body.var).to.eql("localhost:9090");
        });
    }).timeout(5000);

    it("should set FIREBASE_AUTH_EMULATOR_HOST when the emulator is running", async () => {
      emulatorRegistryStub.withArgs(Emulators.AUTH).returns({
        name: Emulators.FIRESTORE,
        host: "localhost",
        port: 9099,
      });

      useFunctions(() => {
        return {
          function_id: require("firebase-functions").https.onRequest(
            (_req: express.Request, res: express.Response) => {
              res.json({
                var: process.env.FIREBASE_AUTH_EMULATOR_HOST,
              });
            }
          ),
        };
      });

      await supertest(functionsEmulator.createHubServer())
        .get("/fake-project-id/us-central1/function_id")
        .expect(200)
        .then((res) => {
          expect(res.body.var).to.eql("localhost:9099");
        });
    }).timeout(TIMEOUT_MED);
  });

  describe("secrets", () => {
    let readFileSyncStub: sinon.SinonStub;
    let accessSecretVersionStub: sinon.SinonStub;

    beforeEach(() => {
      readFileSyncStub = sinon.stub(fs, "readFileSync").throws("Unexpected call");
      accessSecretVersionStub = sinon
        .stub(secretManager, "accessSecretVersion")
        .rejects("Unexpected call");
    });

    afterEach(() => {
      readFileSyncStub.restore();
      accessSecretVersionStub.restore();
    });

    it("should load secret values from local secrets file if one exists", async () => {
      readFileSyncStub.returns("MY_SECRET=local");

      useFunctions(() => {
        return {
          secrets_function_id: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ secret: process.env.MY_SECRET });
            }
          ),
        };
      });

      await supertest(functionsEmulator.createHubServer())
        .get("/fake-project-id/us-central1/secrets_function_id")
        .expect(200)
        .then((res) => {
          expect(res.body.secret).to.equal("local");
        });
    }).timeout(TIMEOUT_LONG);

    it("should try to access secret values from Secret Manager", async () => {
      readFileSyncStub.throws({ code: "ENOENT" });
      accessSecretVersionStub.resolves("secretManager");

      useFunctions(() => {
        return {
          secrets_function_id: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ secret: process.env.MY_SECRET });
            }
          ),
        };
      });

      await supertest(functionsEmulator.createHubServer())
        .get("/fake-project-id/us-central1/secrets_function_id")
        .expect(200)
        .then((res) => {
          expect(res.body.secret).to.equal("secretManager");
        });
    }).timeout(TIMEOUT_LONG);
  });
});
