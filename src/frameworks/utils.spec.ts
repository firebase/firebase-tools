import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as http from "http";
import * as express from "express";
import * as nock from "nock";
import * as supertest from "supertest";
import { once } from "events";
import { AddressInfo } from "net";
import { Readable } from "stream";
import { resolve, join } from "path";

import {
  warnIfCustomBuildScript,
  isUrl,
  getNodeModuleBin,
  conjoinOptions,
  simpleProxy,
  bufferRequestBody,
  MAX_REQUEST_BODY_BYTES,
} from "./utils";
import { FirebaseError } from "../error";

describe("Frameworks utils", () => {
  describe("getNodeModuleBin", () => {
    it("should return expected tsc path", () => {
      expect(getNodeModuleBin("tsc", __dirname)).to.equal(
        resolve(join(__dirname, "..", "..", "node_modules", ".bin", "tsc")),
      );
    }).timeout(5000);
    it("should throw when npm root not found", () => {
      expect(() => {
        getNodeModuleBin("tsc", "/");
      }).to.throw("Could not find the tsc executable.");
    }).timeout(5000);
    it("should throw when executable not found", () => {
      expect(() => {
        getNodeModuleBin("xxxxx", __dirname);
      }).to.throw("Could not find the xxxxx executable.");
    }).timeout(5000);
  });

  describe("isUrl", () => {
    it("should identify http URL", () => {
      expect(isUrl("http://firebase.google.com")).to.be.true;
    });

    it("should identify https URL", () => {
      expect(isUrl("https://firebase.google.com")).to.be.true;
    });

    it("should ignore URL within path", () => {
      expect(isUrl("path/?url=https://firebase.google.com")).to.be.false;
    });

    it("should ignore path starting with http but without protocol", () => {
      expect(isUrl("httpendpoint/foo/bar")).to.be.false;
    });

    it("should ignore path starting with https but without protocol", () => {
      expect(isUrl("httpsendpoint/foo/bar")).to.be.false;
    });
  });

  describe("warnIfCustomBuildScript", () => {
    const framework = "Next.js";
    let sandbox: sinon.SinonSandbox;
    let consoleLogSpy: sinon.SinonSpy;
    const packageJson = {
      scripts: {
        build: "",
      },
    };

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      consoleLogSpy = sandbox.spy(console, "warn");
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should not print warning when a default build script is found.", async () => {
      const buildScript = "next build";
      const defaultBuildScripts = ["next build"];
      packageJson.scripts.build = buildScript;

      sandbox.stub(fs.promises, "readFile").resolves(JSON.stringify(packageJson));

      await warnIfCustomBuildScript("fakedir/", framework, defaultBuildScripts);

      expect(consoleLogSpy.callCount).to.equal(0);
    });

    it("should print warning when a custom build script is found.", async () => {
      const buildScript = "echo 'Custom build script' && next build";
      const defaultBuildScripts = ["next build"];
      packageJson.scripts.build = buildScript;

      sandbox.stub(fs.promises, "readFile").resolves(JSON.stringify(packageJson));

      await warnIfCustomBuildScript("fakedir/", framework, defaultBuildScripts);

      expect(consoleLogSpy).to.be.calledOnceWith(
        `\nWARNING: Your package.json contains a custom build that is being ignored. Only the ${framework} default build script (e.g, "${defaultBuildScripts[0]}") is respected. If you have a more advanced build process you should build a custom integration https://firebase.google.com/docs/hosting/express\n`,
      );
    });
  });

  describe("conjoinOptions", () => {
    const options = [14, 16, 18];
    const defaultSeparator = ",";
    const defaultConjunction = "and";

    it("should return empty string if there's no options", () => {
      expect(conjoinOptions([])).to.be.eql("");
    });

    it("should return option if there's only one", () => {
      expect(conjoinOptions([options[0]])).to.equal(options[0].toString());
    });

    it("should return options without separator if there's two options", () => {
      const twoOptions = options.slice(0, 2);

      expect(conjoinOptions(twoOptions)).to.equal(
        `${twoOptions[0]} ${defaultConjunction} ${twoOptions[1]}`,
      );
    });

    it("should return options with default conjunction and default separator", () => {
      expect(conjoinOptions(options)).to.equal(
        `${options[0]}${defaultSeparator} ${options[1]}${defaultSeparator} ${defaultConjunction} ${options[2]}`,
      );
    });

    it("should return options with custom separator", () => {
      const customSeparator = "/";

      expect(conjoinOptions(options, defaultConjunction, customSeparator)).to.equal(
        `${options[0]}${customSeparator} ${options[1]}${customSeparator} ${defaultConjunction} ${options[2]}`,
      );
    });

    it("should return options with custom conjunction", () => {
      const customConjuntion = "or";

      expect(conjoinOptions(options, customConjuntion, defaultSeparator)).to.equal(
        `${options[0]}${defaultSeparator} ${options[1]}${defaultSeparator} ${customConjuntion} ${options[2]}`,
      );
    });
  });

  describe("bufferRequestBody", () => {
    it("buffers a body within the byte limit", async () => {
      const body = await bufferRequestBody(Readable.from([Buffer.from("hello")]));
      expect(body.toString()).to.equal("hello");
    });

    it("concatenates multiple chunks", async () => {
      const body = await bufferRequestBody(
        Readable.from([Buffer.from("chunked-"), Buffer.from("payload")]),
      );
      expect(body.toString()).to.equal("chunked-payload");
    });

    it("throws a 413 once the body exceeds the limit", async () => {
      let error: unknown;
      try {
        await bufferRequestBody(Readable.from([Buffer.alloc(MAX_REQUEST_BODY_BYTES + 1)]));
      } catch (err) {
        error = err;
      }
      expect(error).to.be.instanceOf(FirebaseError);
      expect(error).to.have.property("status", 413);
    });
  });

  describe("simpleProxy", () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it("should destroy the response when the body errors and the client is gone", async () => {
      // A client disconnecting mid-upload makes bufferRequestBody reject with
      // ECONNRESET and leaves the response un-writable. Writing to the dead socket
      // throws EPIPE and crashes the emulator, so simpleProxy attaches a response
      // error handler and destroys the response instead of writing to it.
      const req = new Readable({ read() {} });
      Object.assign(req, { method: "POST", url: "/api", headers: {} });
      let errorHandlerAttached = false;
      let ended = false;
      let destroyed = false;
      const res = {
        writable: false,
        statusCode: 200,
        on: (event: string) => {
          if (event === "error") errorHandlerAttached = true;
          return res;
        },
        end: () => {
          ended = true;
        },
        destroy: () => {
          destroyed = true;
        },
      };

      const done = simpleProxy("http://127.0.0.1:59999")(req as any, res as any, () => undefined);
      process.nextTick(() =>
        req.destroy(Object.assign(new Error("aborted"), { code: "ECONNRESET" })),
      );
      await done;

      expect(errorHandlerAttached).to.equal(true);
      expect(destroyed).to.equal(true);
      expect(ended).to.equal(false);
    });

    it("should respond 400 when the body errors but the client is still connected", async () => {
      // A malformed/truncated body errors while the socket is still writable — the
      // client can receive a proper 400 rather than a silent teardown.
      const req = new Readable({ read() {} });
      Object.assign(req, { method: "POST", url: "/api", headers: {} });
      let ended = false;
      let destroyed = false;
      const res = {
        writable: true,
        statusCode: 200,
        on: () => res,
        end: () => {
          ended = true;
        },
        destroy: () => {
          destroyed = true;
        },
      };

      const done = simpleProxy("http://127.0.0.1:59999")(req as any, res as any, () => undefined);
      process.nextTick(() => req.destroy(new Error("malformed body")));
      await done;

      expect(res.statusCode).to.equal(400);
      expect(ended).to.equal(true);
      expect(destroyed).to.equal(false);
    });

    it("should buffer the request body and expose it on req.rawBody when cascading", async () => {
      // Regression test for https://github.com/firebase/firebase-tools/issues/5986
      // When the dev server 404s, simpleProxy cascades (calls next) and the
      // consumed POST body must remain available on req.rawBody for the next
      // handler (e.g. a Cloud Functions rewrite).
      nock("http://localhost:8999").post("/api", "payload").reply(404);

      const app = express();
      app.use(simpleProxy("http://localhost:8999"));
      app.use((req, res) => {
        res.json({ rawBody: (req as any).rawBody?.toString() });
      });

      return supertest(app).post("/api").send("payload").expect(200, { rawBody: "payload" });
    });

    it("should pipe through a non-404 response without cascading", async () => {
      nock("http://localhost:8999").post("/api", "payload").reply(200, "handled");

      const app = express();
      app.use(simpleProxy("http://localhost:8999"));
      app.use((_req, res) => {
        res.status(500).send("should not cascade");
      });

      return supertest(app).post("/api").send("payload").expect(200, "handled");
    });

    it("should also buffer a chunked (unknown-length) body for replay", async () => {
      // A chunked request (no content-length) is buffered too, so it remains
      // replayable via req.rawBody when the dev server 404s and we cascade, and
      // it is forwarded to the dev server as a fixed-length body. See issue #5986.
      nock("http://localhost:8999")
        .post("/api", "chunked-payload")
        .matchHeader("content-length", "15")
        .reply(404);

      const app = express();
      app.use(simpleProxy("http://localhost:8999"));
      app.use((req, res) => {
        res.json({ rawBody: (req as any).rawBody?.toString() });
      });

      const server = http.createServer(app).listen(0);
      await once(server, "listening");
      const { port } = server.address() as AddressInfo;
      try {
        const responseBody = await new Promise<string>((resolveBody, rejectBody) => {
          const clientReq = http.request(
            {
              host: "127.0.0.1",
              port,
              method: "POST",
              path: "/api",
              headers: { "Transfer-Encoding": "chunked" },
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (c: Buffer) => chunks.push(c));
              res.on("end", () => resolveBody(Buffer.concat(chunks).toString()));
            },
          );
          clientReq.on("error", rejectBody);
          // Two writes => chunked transfer with no content-length.
          clientReq.write("chunked-");
          clientReq.write("payload");
          clientReq.end();
        });
        expect(JSON.parse(responseBody)).to.deep.equal({ rawBody: "chunked-payload" });
        expect(nock.isDone()).to.equal(true);
      } finally {
        server.close();
      }
    });
  });
});
