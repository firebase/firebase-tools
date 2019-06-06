import { expect } from "chai";
import { FunctionsEmulator, FunctionsRuntimeInstance } from "../../emulator/functionsEmulator";
import * as supertest from "supertest";
import { FunctionRuntimeBundles, TIMEOUT_LONG, TIMEOUT_MED } from "./fixtures";
import * as logger from "../../logger";
import { FunctionsRuntimeBundle } from "../../emulator/functionsEmulatorShared";
import * as express from "express";

if ((process.env.DEBUG || "").toLowerCase().indexOf("spec") >= 0) {
  // tslint:disable-next-line:no-var-requires
  logger.add(require("winston").transports.Console, {
    level: "debug",
    showLevel: false,
    colorize: true,
  });
}

const startFunctionRuntime = FunctionsEmulator.startFunctionRuntime;
function UseFunctions(triggers: () => {}): void {
  const serializedTriggers = triggers.toString();

  FunctionsEmulator.startFunctionRuntime = (
    bundleTemplate: FunctionsRuntimeBundle,
    triggerId: string,
    nodeBinary: string,
    proto?: any
  ): FunctionsRuntimeInstance => {
    return startFunctionRuntime(bundleTemplate, triggerId, nodeBinary, proto, {
      serializedTriggers,
    });
  };
}

describe("FunctionsEmulator-Hub", () => {
  it("should route requests to /:project_id/:region/:trigger_id to HTTPS Function", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .get("/fake-project-id/us-central1/function_id")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should route requests to /:project_id/:region/:trigger_id/ to HTTPS Function", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .get("/fake-project-id/us-central1/function_id/")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/");
      });
  }).timeout(TIMEOUT_LONG);

  it("should route requests to /:project_id/:region/:trigger_id/a/b to HTTPS Function", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .get("/fake-project-id/us-central1/function_id/a/b")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.deep.equal("/a/b");
      });
  }).timeout(TIMEOUT_LONG);

  it("should rewrite req.path to hide /:project_id/:region/:trigger_id", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ path: req.path });
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .get("/fake-project-id/us-central1/function_id/sub/route/a")
      .expect(200)
      .then((res) => {
        expect(res.body.path).to.eq("/sub/route/a");
      });
  }).timeout(TIMEOUT_LONG);

  it("should rewrite req.baseUrl to show /:project_id/:region/:trigger_id", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json({ baseUrl: req.baseUrl });
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .get("/fake-project-id/us-central1/function_id/sub/route/a")
      .expect(200)
      .then((res) => {
        expect(res.body.baseUrl).to.eq("/fake-project-id/us-central1/function_id");
      });
  }).timeout(TIMEOUT_LONG);

  it("should route request body", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json(req.body);
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .post("/fake-project-id/us-central1/function_id/sub/route/a")
      .send({ hello: "world" })
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({ hello: "world" });
      });
  }).timeout(TIMEOUT_LONG);

  it("should route query parameters", async () => {
    UseFunctions(() => {
      require("firebase-admin").initializeApp();
      return {
        function_id: require("firebase-functions").https.onRequest(
          (req: express.Request, res: express.Response) => {
            res.json(req.query);
          }
        ),
      };
    });

    await supertest(
      FunctionsEmulator.createHubServer(FunctionRuntimeBundles.template, process.execPath)
    )
      .get("/fake-project-id/us-central1/function_id/sub/route/a?hello=world")
      .expect(200)
      .then((res) => {
        expect(res.body).to.deep.equal({ hello: "world" });
      });
  }).timeout(TIMEOUT_LONG);
});
