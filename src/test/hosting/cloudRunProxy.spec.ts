import { expect } from "chai";
import * as express from "express";
import * as nock from "nock";
import * as sinon from "sinon";
import * as supertest from "supertest";

import { cloudRunApiOrigin } from "../../api";
import cloudRunProxy, {
  CloudRunProxyOptions,
  CloudRunProxyRewrite,
} from "../../hosting/cloudRunProxy";

describe("cloudRunProxy", () => {
  const fakeOptions: CloudRunProxyOptions = {
    project: "project-foo",
  };

  const fakeRewrite: CloudRunProxyRewrite = { run: { serviceId: "helloworld" } };

  const cloudRunServiceOrigin = "https://helloworld-hash-uc.a.run.app";

  before(() => {
    nock(cloudRunApiOrigin)
      .get("/v1alpha1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { address: { hostname: cloudRunServiceOrigin } } });

    nock(cloudRunServiceOrigin)
      .get("/")
      .reply(200, "live version");

    nock(cloudRunServiceOrigin)
      .get("/vary")
      .reply(200, "live vary version", { vary: "Other, Authorization" });

    nock(cloudRunServiceOrigin)
      .get("/cached")
      .reply(200, "cached page", { "cache-control": "custom", "set-cookie": "nom" });

    nock(cloudRunServiceOrigin)
      .get("/404.html")
      .reply(404, "normal 404");

    nock(cloudRunServiceOrigin)
      .get("/404-cascade.html")
      .reply(404, "normal 404 with cascade", { "x-cascade": "pass" });

    nock(cloudRunServiceOrigin)
      .get("/500")
      .replyWithError({ message: "normal error" });

    nock(cloudRunServiceOrigin)
      .get("/timeout")
      .replyWithError({ message: "ahh", code: "ETIMEDOUT" });

    nock(cloudRunServiceOrigin)
      .get("/sockettimeout")
      .replyWithError({ message: "ahh", code: "ESOCKETTIMEDOUT" });
  });

  after(() => {
    nock.cleanAll();
  });

  it("should resolve a function returns middleware that proxies to the live version", async () => {
    const mwGenerator = await cloudRunProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should pass through normal 404 errors", async () => {
    const mwGenerator = await cloudRunProxy(fakeOptions);
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
    const mwGenerator = await cloudRunProxy(fakeOptions);
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
    const mwGenerator = await cloudRunProxy(fakeOptions);
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
    const mwGenerator = await cloudRunProxy(fakeOptions);
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

  it("should respond with a 500 error if an error occurs calling the Cloud Run service", async () => {
    const mwGenerator = await cloudRunProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/500")
      .expect(500)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should respond with a 504 error if a timeout error occurs calling the Cloud Run service", async () => {
    const mwGenerator = await cloudRunProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/timeout")
      .expect(504)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should respond with a 504 error if a sockettimeout error occurs calling the Cloud Run service", async () => {
    const mwGenerator = await cloudRunProxy(fakeOptions);
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
