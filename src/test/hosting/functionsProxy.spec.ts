import { cloneDeep } from "lodash";
import { expect } from "chai";
import * as express from "express";
import * as nock from "nock";
import * as sinon from "sinon";
import * as supertest from "supertest";

import functionsProxy, {
  FunctionProxyRewrite,
  FunctionsProxyOptions,
} from "../../hosting/functionsProxy";

describe("functionsProxy", () => {
  const fakeOptions: FunctionsProxyOptions = {
    port: 7777,
    project: "project-foo",
    targets: [],
  };

  const fakeRewrite: FunctionProxyRewrite = { function: "bar" };

  afterEach(() => {
    nock.cleanAll();
  });

  it("should resolve a function returns middleware that proxies to the live version", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/")
      .reply(200, "live version");

    const mwGenerator = await functionsProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should resolve a function that returns middleware that proxies to a local version", async () => {
    nock("http://localhost:7778")
      .get("/project-foo/us-central1/bar/")
      .reply(200, "local version");

    const options = cloneDeep(fakeOptions);
    options.targets = ["functions"];
    const mwGenerator = await functionsProxy(options);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "local version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should pass through normal 404 errors", async () => {
    nock("https://us-central1-project-foo.cloudfunctions.net")
      .get("/bar/404.html")
      .reply(404, "normal 404");

    const mwGenerator = await functionsProxy(fakeOptions);
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

    const mwGenerator = await functionsProxy(fakeOptions);
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

    const mwGenerator = await functionsProxy(fakeOptions);
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

    const mwGenerator = await functionsProxy(fakeOptions);
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

    const mwGenerator = await functionsProxy(fakeOptions);
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

    const mwGenerator = await functionsProxy(fakeOptions);
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

    const mwGenerator = await functionsProxy(fakeOptions);
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
