import { cloneDeep } from "lodash";
import { expect } from "chai";
import * as express from "express";
import * as nock from "nock";
import * as sinon from "sinon";
import * as supertest from "supertest";

import {
  functionsProxy,
  FunctionsProxyOptions,
  FunctionProxyRewrite,
} from "../../hosting/functionsProxy";
import { EmulatorRegistry } from "../../emulator/registry";
import { Emulators } from "../../emulator/types";
import { FakeEmulator } from "../emulators/fakeEmulator";

describe("functionsProxy", () => {
  const fakeOptions: FunctionsProxyOptions = {
    port: 7777,
    project: "project-foo",
    targets: [],
  };

  const fakeRewrite: FunctionProxyRewrite = { function: "bar", region: "us-central1" };
  const fakeRewriteEurope: FunctionProxyRewrite = { function: "bar", region: "europe-west3" };

  beforeEach(async () => {
    const fakeFunctionsEmulator = new FakeEmulator(Emulators.FUNCTIONS, "localhost", 7778);
    await EmulatorRegistry.start(fakeFunctionsEmulator);
  });

  afterEach(async () => {
    nock.cleanAll();
    await EmulatorRegistry.stopAll();
  });

  it("should resolve a function returns middleware that proxies to the live version", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/")
      .reply(200, "live version");

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should resolve a function returns middleware that proxies to the live version in another region", async () => {
    nock("https://europe-west3-project-foo.cloudfunctions.net")
      .get("/bar/")
      .reply(200, "live version");

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewriteEurope);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should resolve a function that returns middleware that proxies to a local version", async () => {
    nock("http://localhost:7778").get("/project-foo/us-central1/bar/").reply(200, "local version");

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "local version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should resolve a function that returns middleware that proxies to a local version in another region", async () => {
    nock("http://localhost:7778").get("/project-foo/europe-west3/bar/").reply(200, "local version");

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewriteEurope);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "local version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should maintain the location header as returned by the function", async () => {
    nock("http://localhost:7778")
      .get("/project-foo/us-central1/bar/")
      .reply(301, "", { location: "/over-here" });

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(301)
      .then((res) => {
        expect(res.header["location"]).to.equal("/over-here");
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should allow location headers that wouldn't redirect to itself", async () => {
    nock("http://localhost:7778")
      .get("/project-foo/us-central1/bar/")
      .reply(301, "", { location: "https://example.com/foo" });

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(301)
      .then((res) => {
        expect(res.header["location"]).to.equal("https://example.com/foo");
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should proxy a request body on a POST request", async () => {
    nock("http://localhost:7778")
      .post("/project-foo/us-central1/bar/", "data")
      .reply(200, "you got post data");

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .post("/")
      .send("data")
      .expect(200, "you got post data")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should proxy with a query string", async () => {
    nock("http://localhost:7778")
      .get("/project-foo/us-central1/bar/")
      .query({ key: "value" })
      .reply(200, "query!");

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .query({ key: "value" })
      .expect(200, "query!")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should return 3xx responses directly", async () => {
    nock("http://localhost:7778")
      .get("/project-foo/us-central1/bar/")
      .reply(301, "redirected", { Location: "https://example.com" });

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(301, "redirected")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should pass through multiple set-cookie headers", async () => {
    nock("http://localhost:7778")
      .get("/project-foo/us-central1/bar/")
      .reply(200, "crisp", {
        "Set-Cookie": ["foo=bar", "bar=zap"],
      });

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];

    const mwGenerator = functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect("crisp")
      .then((res) => {
        expect(res.header["set-cookie"]).to.have.length(2);
        expect(res.header["set-cookie"]).to.include("foo=bar");
        expect(res.header["set-cookie"]).to.include("bar=zap");
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should pass through normal 404 errors", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/404.html")
      .reply(404, "normal 404");

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/404.html")
      .expect(404, "normal 404")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should do nothing on 404 errors with x-cascade", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/404-cascade.html")
      .reply(404, "normal 404 with cascade", { "x-cascade": "pass" });

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);
    const finalMw = sinon.stub().callsFake((_, res) => {
      res.status(404).send("unknown response");
    });

    const app = express();
    app.use(spyMw);
    app.use(finalMw);

    return supertest(app)
      .get("/404-cascade.html")
      .expect(404, "unknown response")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should remove cookies on non-private cached responses", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/cached")
      .reply(200, "cached page", { "cache-control": "custom", "set-cookie": "nom" });

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/cached")
      .expect(200, "cached page")
      .then((res) => {
        expect(spyMw.calledOnce).to.be.true;
        expect(res.header["set-cookie"]).to.be.undefined;
      });
  });

  it("should add required Vary headers to the response", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/vary")
      .reply(200, "live vary version", { vary: "Other, Authorization" });

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/vary")
      .expect(200, "live vary version")
      .then((res) => {
        expect(spyMw.calledOnce).to.be.true;
        expect(res.header.vary).to.equal("Other, Authorization, Accept-Encoding, Cookie");
      });
  });

  it("should respond with a 500 error if an error occurs calling the function", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/500")
      .replyWithError({ message: "normal error" });

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/500")
      .expect(500)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should respond with a 504 error if a timeout error occurs calling the function", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/timeout")
      .replyWithError({ message: "ahh", code: "ETIMEDOUT" });

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/timeout")
      .expect(504)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should respond with a 504 error if a sockettimeout error occurs calling the function", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/sockettimeout")
      .replyWithError({ message: "ahh", code: "ESOCKETTIMEDOUT" });

    const mwGenerator = functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/sockettimeout")
      .expect(504)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });
});
