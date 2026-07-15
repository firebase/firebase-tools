import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as express from "express";
import * as supertest from "supertest";
import { resolve, join } from "path";

import {
  BodyParserExports,
  conjoinOptions,
  getBodyParserToleranceShim,
  getNodeModuleBin,
  installBodyParserTolerance,
  isUrl,
  patchBodyParser,
  warnIfCustomBuildScript,
} from "./utils";

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

  describe("body-parser tolerance", () => {
    function loadFreshBodyParserModuleExports(): BodyParserExports {
      for (const requireCacheKey of Object.keys(require.cache)) {
        if (requireCacheKey.includes(`/node_modules/body-parser/`)) {
          delete require.cache[requireCacheKey];
        }
      }
      return require("body-parser") as BodyParserExports;
    }

    type RequestWithRawJsonBody = express.Request & { rawJsonBody?: Buffer };

    function readRawJsonBody(req: express.Request): Buffer | undefined {
      const candidate = (req as RequestWithRawJsonBody).rawJsonBody;
      return Buffer.isBuffer(candidate) ? candidate : undefined;
    }

    /**
     * `json()` plus a POST handler shaped like hardened Next.js API routes in
     * https://github.com/firebase/firebase-tools/issues/10404: `verify` keeps the wire bytes so the
     * route can `JSON.parse` after tolerant `body-parser` skips strict failures.
     */
    function buildApp(bodyParserExports: BodyParserExports): express.Express {
      const app = express();
      app.use(
        bodyParserExports.json!({
          verify: (req: express.Request, _res: express.Response, buf: Buffer) => {
            (req as RequestWithRawJsonBody).rawJsonBody = Buffer.from(buf);
          },
        }) as express.RequestHandler,
      );
      app.post("/", (req, res) => {
        const raw = readRawJsonBody(req);
        if (raw !== undefined && raw.length > 0) {
          try {
            JSON.parse(raw.toString("utf8"));
          } catch {
            return res.status(400).type("text").send("Invalid JSON body");
          }
        }
        res.status(200).json({ body: req.body ?? null });
      });
      return app;
    }

    let bodyParserExports: BodyParserExports;

    beforeEach(() => {
      // `patchBodyParser` mutates exports in place; flush `require.cache` and reload so each test
      // starts from stock `body-parser` getters.
      bodyParserExports = loadFreshBodyParserModuleExports();
    });

    describe("patchBodyParser", () => {
      // https://github.com/firebase/firebase-tools/issues/10404 — malformed `application/json` (for
      // example a truncated body `{` after `POST` + `Content-Type: application/json`) could surface
      // as 500 on Hosting framework SSR while the same app returned 400 under plain `next start`.
      // The tolerance shim only clears `err.type === "entity.parse.failed"` so the downstream
      // framework can read the raw body and respond with a client error instead of failing in
      // Express body-parser middleware first.
      it("lets truncated JSON bodies reach the app route (#10404: POST + application/json + `{`)", async () => {
        patchBodyParser(bodyParserExports);

        const httpResponse = await supertest(buildApp(bodyParserExports))
          .post("/")
          .set("Content-Type", "application/json")
          .send("{");

        expect(httpResponse.status).to.equal(400);
        expect(httpResponse.text).to.equal("Invalid JSON body");
      });

      it("lets invalid JSON that fails strict first-token checks reach the app route (#10404)", async () => {
        patchBodyParser(bodyParserExports);

        const httpResponse = await supertest(buildApp(bodyParserExports))
          .post("/")
          .set("Content-Type", "application/json")
          .send("not-json");

        expect(httpResponse.status).to.equal(400);
        expect(httpResponse.text).to.equal("Invalid JSON body");
      });

      it("parses valid JSON bodies normally", async () => {
        patchBodyParser(bodyParserExports);

        const httpResponse = await supertest(buildApp(bodyParserExports))
          .post("/")
          .set("Content-Type", "application/json")
          .send(JSON.stringify({ foo: "bar" }));

        expect(httpResponse.status).to.equal(200);
        expect(httpResponse.body.body).to.deep.equal({ foo: "bar" });
      });

      it("still propagates non-parse errors (e.g. entity.too.large)", async () => {
        patchBodyParser(bodyParserExports);

        const app = express();
        app.use(bodyParserExports.json!({ limit: "1b" }) as express.RequestHandler);
        app.post("/", (req, res) => res.status(200).send("ok"));

        const httpResponse = await supertest(app)
          .post("/")
          .set("Content-Type", "application/json")
          .send(JSON.stringify({ a: 1 }));

        expect(httpResponse.status).to.equal(413);
      });

      it("leaves non-matching content-types untouched", async () => {
        patchBodyParser(bodyParserExports);

        const httpResponse = await supertest(buildApp(bodyParserExports))
          .post("/")
          .set("Content-Type", "text/plain")
          .send("hello");

        expect(httpResponse.status).to.equal(200);
        expect(httpResponse.body.body).to.deep.equal({});
      });

      // Stock `text` / `raw` parsers do not throw from their parse step, so they do not emit
      // `entity.parse.failed` the way `json` does (#10404). This still guards that wrapping those
      // factories does not break normal parsing.
      it("still parses valid text, urlencoded, and raw bodies after the patch", async () => {
        patchBodyParser(bodyParserExports);

        const textApp = express();
        textApp.use(bodyParserExports.text!({ type: "*/*" }) as express.RequestHandler);
        textApp.post("/", (req, res) => res.json({ body: req.body }));

        const urlApp = express();
        urlApp.use(bodyParserExports.urlencoded!({ extended: false }) as express.RequestHandler);
        urlApp.post("/", (req, res) => res.json({ body: req.body }));

        const rawApp = express();
        rawApp.use(bodyParserExports.raw!({ type: "*/*" }) as express.RequestHandler);
        rawApp.post("/", (req, res) => res.json({ length: (req.body as Buffer).length }));

        const [textResponse, urlResponse, rawResponse] = await Promise.all([
          supertest(textApp).post("/").set("Content-Type", "application/custom").send("hello"),
          supertest(urlApp)
            .post("/")
            .set("Content-Type", "application/x-www-form-urlencoded")
            .send("a=1&b=2"),
          supertest(rawApp).post("/").set("Content-Type", "application/octet-stream").send("hi"),
        ]);

        expect(textResponse.body.body).to.equal("hello");
        expect(urlResponse.body.body).to.deep.equal({ a: "1", b: "2" });
        expect(rawResponse.body.length).to.equal(2);
      });

      it("still propagates extended urlencoded depth failures (not entity.parse.failed)", async () => {
        patchBodyParser(bodyParserExports);

        const app = express();
        app.use(
          bodyParserExports.urlencoded!({ extended: true, depth: 5 }) as express.RequestHandler,
        );
        app.post("/", (req, res) => res.status(200).json({ body: req.body }));

        const httpResponse = await supertest(app)
          .post("/")
          .type("form")
          .send("a[b][c][d][e][f][g][h][i]=1");

        expect(httpResponse.status).to.equal(400);
      });

      it("is idempotent - re-patching does not re-wrap", () => {
        patchBodyParser(bodyParserExports);
        const jsonFactoryAfterFirstPatch = bodyParserExports.json;

        patchBodyParser(bodyParserExports);
        expect(bodyParserExports.json).to.equal(jsonFactoryAfterFirstPatch);
        expect(bodyParserExports.__bodyParserPassthroughApplied).to.equal(true);
      });

      it("hides the patch marker from Object.keys / for..in", () => {
        patchBodyParser(bodyParserExports);
        expect(Object.keys(bodyParserExports)).to.not.include("__bodyParserPassthroughApplied");
      });

      it("handles null and undefined without throwing", () => {
        expect(() => patchBodyParser(null)).to.not.throw();
        expect(() => patchBodyParser(undefined)).to.not.throw();
      });

      it("skips properties whose factory is not a function", () => {
        const partialExports: BodyParserExports = { json: undefined };
        expect(() => patchBodyParser(partialExports)).to.not.throw();
        expect(partialExports.json).to.equal(undefined);
      });
    });

    describe("installBodyParserTolerance", () => {
      it("patches body-parser reachable through require.cache", async () => {
        expect(bodyParserExports.__bodyParserPassthroughApplied).to.be.undefined;

        installBodyParserTolerance();

        expect(bodyParserExports.__bodyParserPassthroughApplied).to.equal(true);

        const httpResponse = await supertest(buildApp(bodyParserExports))
          .post("/")
          .set("Content-Type", "application/json")
          // Same class of failure as #10404 (`entity.parse.failed`), distinct from the truncated `{` probe.
          .send("not-json");

        expect(httpResponse.status).to.equal(400);
        expect(httpResponse.text).to.equal("Invalid JSON body");
      });

      it("is safe to call when no body-parser is loaded or resolvable", () => {
        for (const requireCacheKey of Object.keys(require.cache)) {
          if (requireCacheKey.includes(`/node_modules/body-parser/`)) {
            delete require.cache[requireCacheKey];
          }
        }
        expect(() => installBodyParserTolerance()).to.not.throw();
      });
    });

    describe("getBodyParserToleranceShim", () => {
      const bodyParserToleranceShimSource = getBodyParserToleranceShim();

      it("does not reference module.exports (would clobber host bindings)", () => {
        expect(/\bmodule\.exports\b/.test(bodyParserToleranceShimSource)).to.equal(false);
      });

      it("invokes installBodyParserTolerance at the end", () => {
        expect(
          bodyParserToleranceShimSource.trimEnd().endsWith("installBodyParserTolerance();"),
        ).to.equal(true);
      });

      it("concatenates patchBodyParser and installBodyParserTolerance sources for generated server.js", () => {
        // Do not eval this string under `nyc`: instrumented `Function#toString()` embeds `cov_*`
        // that is out of scope in `new Function` (https://github.com/istanbuljs/nyc/issues/1327).
        // Patches applied at runtime are covered by installBodyParserTolerance / patchBodyParser tests above.
        expect(bodyParserToleranceShimSource).to.include("function patchBodyParser");
        expect(bodyParserToleranceShimSource).to.include("function installBodyParserTolerance");
      });
    });
  });
});
