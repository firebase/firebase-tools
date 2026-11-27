import { expect } from "chai";
import * as express from "express";
import * as sinon from "sinon";
import * as supertest from "supertest";
import { EmulatorLogger } from "../emulatorLogger";
import { Emulators } from "../types";
import { asyncHandler, jsonErrorHandler } from "./express";

describe("shared/express", () => {
  let logStub: sinon.SinonStub;

  beforeEach(() => {
    logStub = sinon.stub(EmulatorLogger.prototype, "log");
  });

  afterEach(() => {
    sinon.restore();
  });

  function appWithRoute(
    handler: (req: express.Request, res: express.Response) => Promise<unknown>,
  ): express.Express {
    const app = express();
    // Keeps Express from printing errors it handles itself (after a response was sent) to stderr.
    app.set("env", "test");
    app.get("/route", asyncHandler(handler));
    app.use(jsonErrorHandler(Emulators.HUB));
    return app;
  }

  describe("jsonErrorHandler", () => {
    it("returns a generic JSON 500 without the error details when a handler rejects", async () => {
      const app = appWithRoute(() => Promise.reject(new Error("boom at /home/someone/project")));

      const res = await supertest(app).get("/route");

      expect(res.status).to.equal(500);
      expect(res.type).to.equal("application/json");
      expect(res.body).to.deep.equal({ error: { code: 500, message: "Internal error" } });
      expect(res.text).to.not.include("boom");
      expect(res.text).to.not.include("/home/someone");
    });

    it("logs server errors through the emulator logger", async () => {
      const app = appWithRoute(() => Promise.reject(new Error("boom")));

      await supertest(app).get("/route");

      expect(logStub).to.have.been.calledOnce;
      const [type, text] = logStub.firstCall.args as [string, string];
      expect(type).to.equal("WARN");
      expect(text).to.include("GET /route failed");
      expect(text).to.include("boom");
    });

    it("keeps a client error's status and message", async () => {
      const app = appWithRoute(() =>
        Promise.reject(Object.assign(new Error("Bad request body"), { status: 400 })),
      );

      const res = await supertest(app).get("/route");

      expect(res.status).to.equal(400);
      expect(res.body).to.deep.equal({ error: { code: 400, message: "Bad request body" } });
      expect(logStub).to.not.have.been.called;
    });

    it("answers malformed JSON bodies with a JSON 400", async () => {
      const app = express();
      app.post("/route", express.json(), (req, res) => {
        res.json({ ok: true });
      });
      app.use(jsonErrorHandler(Emulators.STORAGE));

      const res = await supertest(app)
        .post("/route")
        .set("Content-Type", "application/json")
        .send("{");

      expect(res.status).to.equal(400);
      expect(res.type).to.equal("application/json");
      expect(res.body).to.have.nested.property("error.code", 400);
      expect(res.text).to.not.include("    at ");
    });

    it("leaves a response that was already sent alone", async () => {
      let handlerDone: () => void = () => undefined;
      const handlerSettled = new Promise<void>((resolve) => {
        handlerDone = resolve;
      });
      const app = appWithRoute(async (req, res) => {
        res.status(200).json({ ok: true });
        await new Promise((resolve) => res.once("finish", resolve));
        setImmediate(handlerDone);
        throw new Error("late failure");
      });

      const res = await supertest(app).get("/route");
      await handlerSettled;

      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ ok: true });
      expect(logStub).to.not.have.been.called;
    });
  });
});
