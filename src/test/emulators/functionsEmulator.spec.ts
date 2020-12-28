import { expect } from "chai";
import { FunctionsEmulator, InvokeRuntimeOpts } from "../../emulator/functionsEmulator";
import * as supertest from "supertest";
import { TIMEOUT_LONG, MODULE_ROOT } from "./fixtures";
import * as logger from "../../logger";
import { EmulatedTriggerType } from "../../emulator/functionsEmulatorShared";
import * as express from "express";
import { RuntimeWorker } from "../../emulator/functionsRuntimeWorker";

if ((process.env.DEBUG || "").toLowerCase().indexOf("spec") >= 0) {
  // tslint:disable-next-line:no-var-requires
  logger.add(require("winston").transports.Console, {
    level: "debug",
    showLevel: false,
    colorize: true,
  });
}

const functionsEmulator = new FunctionsEmulator({
  projectId: "fake-project-id",
  functionsDir: MODULE_ROOT,
  quiet: true,
});

// This is normally discovered in FunctionsEmulator#start()
functionsEmulator.nodeBinary = process.execPath;

functionsEmulator.setTriggersForTesting([
  {
    name: "function_id",
    entryPoint: "function_id",
    httpsTrigger: {},
    labels: {},
  },
  {
    name: "callable_function_id",
    entryPoint: "callable_function_id",
    httpsTrigger: {},
    labels: {
      "deployment-callable": "true",
    },
  },
  {
    name: "nested-function_id",
    entryPoint: "nested.function_id",
    httpsTrigger: {},
    labels: {},
  },
]);

// TODO(samstern): This is an ugly way to just override the InvokeRuntimeOpts on each call
const startFunctionRuntime = functionsEmulator.startFunctionRuntime.bind(functionsEmulator);
function useFunctions(triggers: () => {}): void {
  const serializedTriggers = triggers.toString();

  // eslint-disable-next-line @typescript-eslint/unbound-method
  functionsEmulator.startFunctionRuntime = (
    triggerId: string,
    triggerType: EmulatedTriggerType,
    proto?: any,
    runtimeOpts?: InvokeRuntimeOpts
  ): RuntimeWorker => {
    return startFunctionRuntime(triggerId, triggerType, proto, {
      nodeBinary: process.execPath,
      serializedTriggers,
    });
  };
}

describe("FunctionsEmulator-Hub", () => {
  it("should route requests to /:project_id/:region/:trigger_id to HTTPS Function", async () => {
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

    await supertest(functionsEmulator.createHubServer())
      .get("/foo/bar/baz")
      .expect(404);
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

  it("should rewrite req.baseUrl to show /:project_id/:region/:trigger_id", async () => {
    useFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ baseUrl: req.baseUrl });
          }
        ),
      };
    });

    await supertest(functionsEmulator.createHubServer())
      .get("/fake-project-id/us-central1/function_id/sub/route/a")
      .expect(200)
      .then((res) => {
        expect(res.body.baseUrl).to.eq("/fake-project-id/us-central1/function_id");
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
});
