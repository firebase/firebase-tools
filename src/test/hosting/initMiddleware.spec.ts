import { createGunzip, createGzip } from "zlib";
import { expect } from "chai";
import * as express from "express";
import * as http from "http";
import * as nock from "nock";
import * as portfinder from "portfinder";
import * as supertest from "supertest";

import { initMiddleware } from "../../hosting/initMiddleware";
import { streamToString, stringToStream } from "../../utils";
import { TemplateServerResponse } from "../../hosting/implicitInit";

const templateServerRes: TemplateServerResponse = {
  js: "here is some js",
  emulatorsJs: "emulator js",
  json: JSON.stringify({ id: "foo" }),
};

describe("initMiddleware", () => {
  it("should be able to proxy a basic sdk request", async () => {
    nock("https://www.gstatic.com").get("/firebasejs/v2.2.2/sample-sdk.js").reply(200, "content");

    const mw = initMiddleware(templateServerRes);

    await supertest(mw)
      .get("/__/firebase/v2.2.2/sample-sdk.js")
      .expect(200)
      .then((res) => {
        expect(res.text).to.equal("content");
        expect(nock.isDone()).to.be.true;
      });
  });

  it("should be able to proxy with the correct accept-encoding", async () => {
    nock("https://www.gstatic.com")
      .get("/firebasejs/v2.2.2/sample-sdk.js")
      .matchHeader("accept-encoding", "brrr")
      .reply(200, "content");

    const mw = initMiddleware(templateServerRes);

    await supertest(mw)
      .get("/__/firebase/v2.2.2/sample-sdk.js")
      .set("accept-encoding", "brrr")
      .expect(200)
      .then((res) => {
        expect(res.text).to.equal("content");
        expect(nock.isDone()).to.be.true;
      });
  });

  it("should provide the init.js file", async () => {
    const mw = initMiddleware(templateServerRes);

    await supertest(mw)
      .get("/__/firebase/init.js")
      .expect(200, templateServerRes.js)
      .expect("content-type", "application/javascript");
  });

  it("should provide the emulator init.js file when appropriate", async () => {
    const mw = initMiddleware(templateServerRes);

    await supertest(mw)
      .get("/__/firebase/init.js")
      .query({ useEmulator: true })
      .expect(200, templateServerRes.emulatorsJs)
      .expect("content-type", "application/javascript");
  });

  it("should provide the firebase config (init.json)", async () => {
    const mw = initMiddleware(templateServerRes);

    await supertest(mw)
      .get("/__/firebase/init.json")
      .expect(200, { id: "foo" })
      .expect("content-type", "application/json");
  });

  it("should pass (call next) if the sdk file doesn't exit", async () => {
    nock("https://www.gstatic.com").get("/firebasejs/v2.2.2/sample-sdk.js").reply(404, "no sdk");

    const app = express();
    const mw = initMiddleware(templateServerRes);
    app.use(mw);
    app.use((req: unknown, res: express.Response) => {
      res.status(200).send("index");
    });

    await supertest(app)
      .get("/__/firebase/v2.2.2/sample-sdk.js")
      .expect(200)
      .then((res) => {
        expect(res.text).to.equal("index");
        expect(nock.isDone()).to.be.true;
      });
  });

  it("should ignore any other request path (200)", async () => {
    const app = express();
    const mw = initMiddleware(templateServerRes);
    app.use(mw);
    app.use((req, res) => {
      res.status(200).send("index");
    });

    await supertest(app)
      .get("/anything.else")
      .expect(200)
      .then((res) => {
        expect(res.text).to.equal("index");
      });
  });

  it("should ignore any other request path (403)", async () => {
    const app = express();
    const mw = initMiddleware(templateServerRes);
    app.use(mw);
    app.use((req, res) => {
      res.status(403).send("not here");
    });

    await supertest(app)
      .get("/anything.else")
      .expect(403)
      .then((res) => {
        expect(res.text).to.equal("not here");
      });
  });

  describe("when dealing with compressed data", () => {
    // This needs to be done using a running server. All the testing libraries
    // automatically handle compressed data, so a real request against a real
    // server is the easiest way to confirm this behavior.
    const content = "this should be compressed";
    const contentStream = stringToStream(content);
    const compressedStream = contentStream?.pipe(createGzip());

    const app = express();
    app.use(initMiddleware(templateServerRes));

    let server: http.Server;
    let port: number;

    beforeEach(async () => {
      port = await portfinder.getPortPromise();
      await new Promise<void>((resolve) => (server = app.listen(port, resolve)));
    });

    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it("should return compressed data if it is returned compressed", async () => {
      nock("https://www.gstatic.com")
        .get("/firebasejs/v2.2.2/sample-sdk.js")
        .reply(200, () => compressedStream, { "content-encoding": "gzip" });

      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          {
            method: "GET",
            port,
            path: `/__/firebase/v2.2.2/sample-sdk.js`,
          },
          resolve,
        );
        req.on("error", reject);
        req.end();
      });

      // The response should be gzipped, so piping it here should decompress it.
      const gunzip = createGunzip();
      const uncompressed = res.pipe(gunzip);
      const c = await streamToString(uncompressed);
      expect(c).to.equal(content);
      expect(nock.isDone()).to.be.true;
    });
  });
});
