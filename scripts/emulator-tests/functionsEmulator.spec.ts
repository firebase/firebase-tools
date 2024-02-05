import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

import { expect } from "chai";
import * as express from "express";
import * as sinon from "sinon";
import * as supertest from "supertest";
import * as winston from "winston";
import * as logform from "logform";

import { EmulatedTriggerDefinition } from "../../src/emulator/functionsEmulatorShared";
import { EmulatableBackend, FunctionsEmulator } from "../../src/emulator/functionsEmulator";
import { EmulatorInfo, Emulators } from "../../src/emulator/types";
import { FakeEmulator } from "../../src/test/emulators/fakeEmulator";
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
        logform.format.printf(dropLogLevels),
      ),
    }),
  );
}

const FUNCTIONS_DIR = path.resolve(
  // MODULE_ROOT points to firebase-tools/dev since that's where this test file is compiled to.
  // Function source directory is located on firebase-tools/ hence the "..". See run.sh
  path.join(MODULE_ROOT, "..", "scripts/emulator-tests/functions"),
  // path.join(MODULE_ROOT, "scripts/emulator-tests/functions")
);

const TEST_BACKEND: EmulatableBackend = {
  functionsDir: FUNCTIONS_DIR,
  env: {},
  secretEnv: [],
  codebase: "default",
  runtime: "nodejs14",
  bin: process.execPath,
  // NOTE: Use the following node bin path if you want to run test cases directly from your IDE.
  // bin: path.join(MODULE_ROOT, "node_modules/.bin/ts-node"),
};

async function setupEnvFiles(envs: Record<string, string>) {
  const envFiles: string[] = [];
  for (const [filename, data] of Object.entries(envs)) {
    const envPath = path.join(FUNCTIONS_DIR, filename);
    await fsp.writeFile(path.join(FUNCTIONS_DIR, filename), data);
    envFiles.push(envPath);
  }
  return async () => {
    await Promise.all(envFiles.map((f) => fsp.rm(f)));
  };
}

async function writeSource(
  triggerSource: () => void,
  params?: Record<string, () => void>,
): Promise<() => Promise<void>> {
  let sourceCode = `module.exports = (${triggerSource.toString()})();\n`;
  const sourcePath = path.join(FUNCTIONS_DIR, "index.js");
  if (params) {
    for (const [paramName, valFn] of Object.entries(params)) {
      sourceCode = `const ${paramName} = (${valFn.toString()})();\n${sourceCode}`;
      // Since parameter cannot be references before it's defined, employ this hack to
      // replace all "string-escaped" param references to real instances.
      sourceCode = sourceCode.replaceAll(`"__$${paramName}__"`, paramName);
    }
  }
  await fsp.writeFile(sourcePath, sourceCode);
  return async () => {
    await fsp.rm(sourcePath);
  };
}

async function useFunction(
  emu: FunctionsEmulator,
  triggerName: string,
  triggerSource: () => {},
  regions: string[] = ["us-central1"],
  triggerOverrides?: Partial<EmulatedTriggerDefinition>,
): Promise<void> {
  await writeSource(triggerSource);
  const triggers: EmulatedTriggerDefinition[] = [];
  for (const region of regions) {
    triggers.push({
      platform: "gcfv1",
      name: triggerName,
      entryPoint: triggerName.replace(/-/g, "."),
      id: `${region}-${triggerName}`,
      region,
      codebase: "default",
      httpsTrigger: {},
      ...triggerOverrides,
    });
  }
  emu.setTriggersForTesting(triggers, TEST_BACKEND);
}

const TEST_PROJECT_ID = "fake-project-id";

describe("FunctionsEmulator", function () {
  // eslint-disable-next-line @typescript-eslint/no-invalid-this
  this.timeout(TIMEOUT_LONG);

  let emu: FunctionsEmulator;

  beforeEach(() => {
    emu = new FunctionsEmulator({
      projectId: TEST_PROJECT_ID,
      projectDir: MODULE_ROOT,
      emulatableBackends: [TEST_BACKEND],
      verbosity: "QUIET",
      adminSdkConfig: {
        projectId: TEST_PROJECT_ID,
        databaseURL: `https://${TEST_PROJECT_ID}-default-rtdb.firebaseio.com`,
        storageBucket: `${TEST_PROJECT_ID}.appspot.com`,
      },
    });
  });

  afterEach(async () => {
    await emu.stop();
  });

  describe("Hub", () => {
    it("should route requests to /:project_id/us-central1/:trigger_id to default region HTTPS Function", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId`)
        .expect(200)
        .then((res) => {
          expect(res.body.path).to.deep.equal("/");
        });
    });

    it("should route requests to /:project_id/:other-region/:trigger_id to the region's HTTPS Function", async () => {
      await useFunction(
        emu,
        "functionId",
        () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .region("us-central1", "europe-west2")
              .https.onRequest((req: express.Request, res: express.Response) => {
                res.json({ path: req.path });
              }),
          };
        },
        ["us-central1", "europe-west2"],
      );

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/europe-west2/functionId`)
        .expect(200)
        .then((res) => {
          expect(res.body.path).to.deep.equal("/");
        });
    });

    it("should 404 when a function doesn't exist in the region", async () => {
      await useFunction(
        emu,
        "functionId",
        () => {
          require("firebase-admin").initializeApp();
          return {
            functionId: require("firebase-functions")
              .region("us-central1", "europe-west2")
              .https.onRequest((req: express.Request, res: express.Response) => {
                res.json({ path: req.path });
              }),
          };
        },
        ["us-central1", "europe-west2"],
      );

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-east1/functionId`)
        .expect(404);
    });

    it("should route requests to /:project_id/:region/:trigger_id/ to HTTPS Function", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId/`)
        .expect(200)
        .then((res) => {
          expect(res.body.path).to.deep.equal("/");
        });
    });

    it("should 404 when a function does not exist", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionDNE`)
        .expect(404);
    });

    it("should properly route to a namespaced/grouped HTTPs function", async () => {
      await useFunction(emu, "nested-functionId", () => {
        return {
          nested: {
            functionId: require("firebase-functions").https.onRequest(
              (req: express.Request, res: express.Response) => {
                res.json({ path: req.path });
              },
            ),
          },
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/nested-functionId`)
        .expect(200)
        .then((res) => {
          expect(res.body.path).to.deep.equal("/");
        });
    });

    it("should route requests to /:project_id/:region/:trigger_id/a/b to HTTPS Function", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId/a/b`)
        .expect(200)
        .then((res) => {
          expect(res.body.path).to.deep.equal("/a/b");
        });
    });

    it("should reject requests to a non-emulator path", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer()).get("/foo/bar/baz").expect(404);
    });

    it("should rewrite req.path to hide /:project_id/:region/:trigger_id", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId/sub/route/a`)
        .expect(200)
        .then((res) => {
          expect(res.body.path).to.eq("/sub/route/a");
        });
    });

    it("should return the correct url, baseUrl, originalUrl for the root route", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({
                url: req.url,
                baseUrl: req.baseUrl,
                originalUrl: req.originalUrl,
              });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId`)
        .expect(200)
        .then((res) => {
          expect(res.body.url).to.eq("/");
          expect(res.body.baseUrl).to.eq("");
          expect(res.body.originalUrl).to.eq("/");
        });
    });

    it("should return the correct url, baseUrl, originalUrl with query params", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({
                url: req.url,
                baseUrl: req.baseUrl,
                originalUrl: req.originalUrl,
                query: req.query,
              });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId?a=1&b=2`)
        .expect(200)
        .then((res) => {
          expect(res.body.url).to.eq("/?a=1&b=2");
          expect(res.body.baseUrl).to.eq("");
          expect(res.body.originalUrl).to.eq("/?a=1&b=2");
          expect(res.body.query).to.deep.eq({ a: "1", b: "2" });
        });
    });

    it("should return the correct url, baseUrl, originalUrl for a subroute", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({
                url: req.url,
                baseUrl: req.baseUrl,
                originalUrl: req.originalUrl,
              });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId/sub/route/a`)
        .expect(200)
        .then((res) => {
          expect(res.body.url).to.eq("/sub/route/a");
          expect(res.body.baseUrl).to.eq("");
          expect(res.body.originalUrl).to.eq("/sub/route/a");
        });
    });

    it("should return the correct url, baseUrl, originalUrl for any region", async () => {
      await useFunction(
        emu,
        "functionId",
        () => {
          return {
            functionId: require("firebase-functions")
              .region("europe-west3")
              .https.onRequest((req: express.Request, res: express.Response) => {
                res.json({
                  url: req.url,
                  baseUrl: req.baseUrl,
                  originalUrl: req.originalUrl,
                  query: req.query,
                });
              }),
          };
        },
        ["europe-west3"],
      );

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/europe-west3/functionId?a=1&b=2`)
        .expect(200)
        .then((res) => {
          expect(res.body.url).to.eq("/?a=1&b=2");
          expect(res.body.baseUrl).to.eq("");
          expect(res.body.originalUrl).to.eq("/?a=1&b=2");
          expect(res.body.query).to.deep.eq({ a: "1", b: "2" });
        });
    });

    it("should route request body", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json(req.body);
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .post(`/${TEST_PROJECT_ID}/us-central1/functionId/sub/route/a`)
        .send({ hello: "world" })
        .expect(200)
        .then((res) => {
          expect(res.body).to.deep.equal({ hello: "world" });
        });
    });

    it("should route query parameters", async () => {
      await useFunction(emu, "functionId", () => {
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json(req.query);
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get(`/${TEST_PROJECT_ID}/us-central1/functionId/sub/route/a?hello=world`)
        .expect(200)
        .then((res) => {
          expect(res.body).to.deep.equal({ hello: "world" });
        });
    });

    it("should override callable auth", async () => {
      await useFunction(emu, "callableFunctionId", () => {
        return {
          callableFunctionId: require("firebase-functions").https.onCall((data: any, ctx: any) => {
            return {
              auth: ctx.auth,
            };
          }),
        };
      });

      // For token info:
      // https://jwt.io/#debugger-io?token=eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsInVzZXJfaWQiOiJTbW56OE8xcmxkZmptZHg4QVJVdE12WG1tdzYyIiwic3ViIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsImlhdCI6MTU4NTA1MzI2NCwiZXhwIjoxNTg1MDU2ODY0LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImFub255bW91cyJ9fQ.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw
      await supertest(emu.createHubServer())
        .post(`/${TEST_PROJECT_ID}/us-central1/callableFunctionId`)
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
    });

    it("should override callable auth with unicode", async () => {
      await useFunction(emu, "callableFunctionId", () => {
        return {
          callableFunctionId: require("firebase-functions").https.onCall((data: any, ctx: any) => {
            return {
              auth: ctx.auth,
            };
          }),
        };
      });

      // For token info:
      // https://jwt.io/#debugger-io?token=eyJhbGciOiJSUzI1NiIsImtpZCI6IjFmODhiODE0MjljYzQ1MWEzMzVjMmY1Y2RiM2RmYjM0ZWIzYmJjN2YiLCJ0eXAiOiJKV1QifQ.eyJwcm92aWRlcl9pZCI6ImFub255bW91cyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9maXItZHVtcHN0ZXIiLCJhdWQiOiJmaXItZHVtcHN0ZXIiLCJhdXRoX3RpbWUiOjE1ODUwNTMyNjQsIm5hbWUiOiLlsbHnlLDlpKrpg44iLCJ1c2VyX2lkIjoiU21uejhPMXJsZGZqbWR4OEFSVXRNdlhtbXc2MiIsInN1YiI6IlNtbno4TzFybGRmam1keDhBUlV0TXZYbW13NjIiLCJpYXQiOjE1ODUwNTMyNjQsImV4cCI6MTU4NTA1Njg2NCwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6e30sInNpZ25faW5fcHJvdmlkZXIiOiJhbm9ueW1vdXMifX0.ujOthXwov9NJAOmJfumkDzMQgj8P1YRWkhFeq_HqHpPmth1BbtrQ_duwFoFmAPGjnGTuozUi0YUl8eKh4p2CqXi-Wf_OLSumxNnJWhj_tm7OvYWjvUy0ZvjilPBrhQ17_lRnhyOVSLSXfneqehYvE85YkBkFy3GtOpN49fRdmBT7B71Yx8E8SM7fohlia-ah7_uSNpuJXzQ9-0rv6HH9uBYCmjUxb9MiuKwkIjDoYtjTuaqG8-4w8bPrKHmg6V7HeDSNItUcfDbALZiTsM5uob_uuVTwjCCQnwryB5Y3bmdksTqCvp8U7ZTU04HS9CJawTa-zuDXIwlOvsC-J8oQQw
      await supertest(emu.createHubServer())
        .post(`/${TEST_PROJECT_ID}/us-central1/callableFunctionId`)
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
    });

    it("should override callable auth with a poorly padded ID Token", async () => {
      await useFunction(emu, "callableFunctionId", () => {
        return {
          callableFunctionId: require("firebase-functions").https.onCall((data: any, ctx: any) => {
            return {
              auth: ctx.auth,
            };
          }),
        };
      });

      // For token info:
      // https://jwt.io/#debugger-io?token=eyJhbGciOiJub25lIiwia2lkIjoiZmFrZWtpZCJ9.eyJ1aWQiOiJhbGljZSIsImVtYWlsIjoiYWxpY2VAZXhhbXBsZS5jb20iLCJpYXQiOjAsInN1YiI6ImFsaWNlIn0%3D.
      await supertest(emu.createHubServer())
        .post(`/${TEST_PROJECT_ID}/us-central1/callableFunctionId`)
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
    });

    it("should preserve the Authorization header for callable auth", async () => {
      await useFunction(emu, "callableFunctionId", () => {
        return {
          callableFunctionId: require("firebase-functions").https.onCall((data: any, ctx: any) => {
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
      await supertest(emu.createHubServer())
        .post(`/${TEST_PROJECT_ID}/us-central1/callableFunctionId`)
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
    });

    it("should respond to requests to /backends to with info about the running backends", async () => {
      await useFunction(emu, "functionId", () => {
        require("firebase-admin").initializeApp();
        return {
          functionId: require("firebase-functions").https.onRequest(
            (req: express.Request, res: express.Response) => {
              res.json({ path: req.path });
            },
          ),
        };
      });

      await supertest(emu.createHubServer())
        .get("/backends")
        .expect(200)
        .then((res) => {
          // TODO(b/216642962): Add tests for this endpoint that validate behavior when there are Extensions running
          expect(res.body.backends.length).to.equal(1);
          expect(res.body.backends[0].functionTriggers).to.deep.equal([
            {
              entryPoint: "functionId",
              httpsTrigger: {},
              id: "us-central1-functionId",
              name: "functionId",
              platform: "gcfv1",
              codebase: "default",
              region: "us-central1",
            },
          ]);
        });
    });

    describe("system environment variables", () => {
      const startFakeEmulator = async (emulator: Emulators): Promise<EmulatorInfo> => {
        const fake = await FakeEmulator.create(emulator);
        await registry.EmulatorRegistry.start(fake);
        return fake.getInfo();
      };

      afterEach(() => {
        return registry.EmulatorRegistry.stopAll();
      });

      it("should set env vars when the emulator is running", async () => {
        const database = await startFakeEmulator(Emulators.DATABASE);
        const firestore = await startFakeEmulator(Emulators.FIRESTORE);
        const auth = await startFakeEmulator(Emulators.AUTH);

        await useFunction(emu, "functionId", () => {
          return {
            functionId: require("firebase-functions").https.onRequest(
              (_req: express.Request, res: express.Response) => {
                res.json({
                  databaseHost: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
                  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
                  authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
                });
              },
            ),
          };
        });

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/functionId`)
          .expect(200)
          .then((res) => {
            expect(res.body.databaseHost).to.eql(`${database.host}:${database.port}`);
            expect(res.body.firestoreHost).to.eql(`${firestore.host}:${firestore.port}`);
            expect(res.body.authHost).to.eql(`${auth.host}:${auth.port}`);
          });
      }).timeout(TIMEOUT_MED);

      it("should return an emulated databaseURL when RTDB emulator is running", async () => {
        const database = await startFakeEmulator(Emulators.DATABASE);

        await useFunction(emu, "functionId", () => {
          return {
            functionId: require("firebase-functions").https.onRequest(
              (_req: express.Request, res: express.Response) => {
                res.json(JSON.parse(process.env.FIREBASE_CONFIG!));
              },
            ),
          };
        });

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/functionId`)
          .expect(200)
          .then((res) => {
            expect(res.body.databaseURL).to.eql(
              `http://${database.host}:${database.port}/?ns=${TEST_PROJECT_ID}-default-rtdb`,
            );
          });
      }).timeout(TIMEOUT_MED);

      it("should return a real databaseURL when RTDB emulator is not running", async () => {
        await useFunction(emu, "functionId", () => {
          return {
            functionId: require("firebase-functions").https.onRequest(
              (_req: express.Request, res: express.Response) => {
                res.json(JSON.parse(process.env.FIREBASE_CONFIG!));
              },
            ),
          };
        });

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/functionId`)
          .expect(200)
          .then((res) => {
            expect(res.body.databaseURL).to.eql(
              `https://${TEST_PROJECT_ID}-default-rtdb.firebaseio.com`,
            );
          });
      }).timeout(TIMEOUT_MED);

      it("should report GMT time zone", async () => {
        await useFunction(emu, "functionId", () => {
          return {
            functionId: require("firebase-functions").https.onRequest(
              (_req: express.Request, res: express.Response) => {
                const now = new Date();
                res.json({ offset: now.getTimezoneOffset() });
              },
            ),
          };
        });

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/functionId`)
          .expect(200)
          .then((res) => {
            expect(res.body.offset).to.eql(0);
          });
      }).timeout(TIMEOUT_MED);
    });

    describe("user-defined environment variables", () => {
      let cleanup: (() => Promise<void>) | undefined;

      afterEach(async () => {
        await cleanup?.();
        cleanup = undefined;
      });

      it("should load environment variables in .env file", async () => {
        cleanup = await setupEnvFiles({
          ".env": "FOO=foo\nBAR=bar",
        });

        await useFunction(
          emu,
          "dotenv",
          () => {
            return {
              dotenv: require("firebase-functions").https.onRequest(
                (req: express.Request, res: express.Response) => {
                  res.json({
                    FOO: process.env.FOO,
                    BAR: process.env.BAR,
                  });
                },
              ),
            };
          },
          ["us-central1"],
        );

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/dotenv`)
          .expect(200)
          .then((res) => {
            expect(res.body).to.deep.equal({ FOO: "foo", BAR: "bar" });
          });
      });

      it("should prefer environment variables in .env.{projectId} file", async () => {
        cleanup = await setupEnvFiles({
          ".env": "FOO=foo",
          [`.env.${TEST_PROJECT_ID}`]: "FOO=goo",
        });

        await useFunction(
          emu,
          "dotenv",
          () => {
            return {
              dotenv: require("firebase-functions").https.onRequest(
                (req: express.Request, res: express.Response) => {
                  res.json({
                    FOO: process.env.FOO,
                  });
                },
              ),
            };
          },
          ["us-central1"],
        );

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/dotenv`)
          .expect(200)
          .then((res) => {
            expect(res.body).to.deep.equal({ FOO: "goo" });
          });
      });

      it("should prefer environment variables in .env.local file", async () => {
        cleanup = await setupEnvFiles({
          ".env": "FOO=foo",
          [`.env.${TEST_PROJECT_ID}`]: "FOO=goo",
          ".env.local": "FOO=hoo",
        });

        await useFunction(
          emu,
          "dotenv",
          () => {
            return {
              dotenv: require("firebase-functions").https.onRequest(
                (req: express.Request, res: express.Response) => {
                  res.json({
                    FOO: process.env.FOO,
                  });
                },
              ),
            };
          },
          ["us-central1"],
        );

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/dotenv`)
          .expect(200)
          .then((res) => {
            expect(res.body).to.deep.equal({ FOO: "hoo" });
          });
      });
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

        await useFunction(
          emu,
          "secretsFunctionId",
          () => {
            return {
              secretsFunctionId: require("firebase-functions").https.onRequest(
                (req: express.Request, res: express.Response) => {
                  res.json({ secret: process.env.MY_SECRET });
                },
              ),
            };
          },
          ["us-central1"],
          {
            secretEnvironmentVariables: [
              {
                projectId: TEST_PROJECT_ID,
                secret: "MY_SECRET",
                key: "MY_SECRET",
                version: "1",
              },
            ],
          },
        );

        await supertest(emu.createHubServer())
          .get("/" + TEST_PROJECT_ID + "/us-central1/secretsFunctionId")
          .expect(200)
          .then((res) => {
            expect(res.body.secret).to.equal("local");
          });
      });

      it("should try to access secret values from Secret Manager", async () => {
        readFileSyncStub.throws({ code: "ENOENT" });
        accessSecretVersionStub.resolves("secretManager");

        await useFunction(
          emu,
          "secretsFunctionId",
          () => {
            return {
              secretsFunctionId: require("firebase-functions").https.onRequest(
                (req: express.Request, res: express.Response) => {
                  res.json({ secret: process.env.MY_SECRET });
                },
              ),
            };
          },
          ["us-central1"],
          {
            secretEnvironmentVariables: [
              {
                projectId: TEST_PROJECT_ID,
                secret: "MY_SECRET",
                key: "MY_SECRET",
                version: "1",
              },
            ],
          },
        );

        await supertest(emu.createHubServer())
          .get(`/${TEST_PROJECT_ID}/us-central1/secretsFunctionId`)
          .expect(200)
          .then((res) => {
            expect(res.body.secret).to.equal("secretManager");
          });
      });
    });
  });

  describe("Discover", () => {
    let cleanupSource: (() => Promise<void>) | undefined;
    let cleanupEnvs: (() => Promise<void>) | undefined;

    afterEach(async () => {
      await cleanupSource?.();
      await cleanupEnvs?.();
    });

    it("resolves function with parameter value defined in .env correctly", async () => {
      cleanupSource = await writeSource(
        () => {
          return {
            functionId: require("firebase-functions")
              .runWith({ timeoutSeconds: "__$timeout__" })
              .https.onRequest((req: express.Request, res: express.Response) => {
                res.json({ path: req.path });
              }),
          };
        },
        {
          timeout: () => require("firebase-functions/params").defineInt("TIMEOUT"),
        },
      );
      cleanupEnvs = await setupEnvFiles({
        ".env": "TIMEOUT=24",
      });

      const triggerDefinitions = await emu.discoverTriggers(TEST_BACKEND);
      expect(triggerDefinitions).to.have.length(1);
      expect(triggerDefinitions[0].timeoutSeconds).to.equal(24);
    });

    it("resolves function with parameter value defined in .env.projectId correctly", async () => {
      cleanupSource = await writeSource(
        () => {
          return {
            functionId: require("firebase-functions")
              .runWith({ timeoutSeconds: "__$timeout__" })
              .https.onRequest((req: express.Request, res: express.Response) => {
                res.json({ path: req.path });
              }),
          };
        },
        {
          timeout: () => require("firebase-functions/params").defineInt("TIMEOUT"),
        },
      );
      cleanupEnvs = await setupEnvFiles({
        ".env": "TIMEOUT=24",
        [`.env.${TEST_PROJECT_ID}`]: "TIMEOUT=25",
      });

      const triggerDefinitions = await emu.discoverTriggers(TEST_BACKEND);
      expect(triggerDefinitions).to.have.length(1);
      expect(triggerDefinitions[0].timeoutSeconds).to.equal(25);
    });

    it("resolves function with parameter value defined in .env.local correctly", async () => {
      cleanupSource = await writeSource(
        () => {
          return {
            functionId: require("firebase-functions")
              .runWith({ timeoutSeconds: "__$timeout__" })
              .https.onRequest((req: express.Request, res: express.Response) => {
                res.json({ path: req.path });
              }),
          };
        },
        {
          timeout: () => require("firebase-functions/params").defineInt("TIMEOUT"),
        },
      );
      cleanupEnvs = await setupEnvFiles({
        ".env": "TIMEOUT=24",
        [`.env.${TEST_PROJECT_ID}`]: "TIMEOUT=25",
        ".env.local": "TIMEOUT=26",
      });

      const triggerDefinitions = await emu.discoverTriggers(TEST_BACKEND);
      expect(triggerDefinitions).to.have.length(1);
      expect(triggerDefinitions[0].timeoutSeconds).to.equal(26);
    });
  });

  it("should enforce timeout", async () => {
    await useFunction(
      emu,
      "timeoutFn",
      () => {
        return {
          timeoutFn: require("firebase-functions")
            .runWith({ timeoutSeconds: 1 })
            .https.onRequest((req: express.Request, res: express.Response): Promise<void> => {
              return new Promise((resolve) => {
                setTimeout(() => {
                  res.sendStatus(200);
                  resolve();
                }, 5_000);
              });
            }),
        };
      },
      ["us-central1"],
      {
        timeoutSeconds: 1,
      },
    );

    await supertest(emu.createHubServer())
      .get("/fake-project-id/us-central1/timeoutFn")
      .expect(500);
  });
});
