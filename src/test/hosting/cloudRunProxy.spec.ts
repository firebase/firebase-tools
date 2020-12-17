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

  afterEach(() => {
    nock.cleanAll();
  });

  it("should error when not provided a valid Cloud Run service ID", async () => {
    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator({ run: { serviceId: "" } });
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(500, /Cloud Run rewrites must supply a service ID/g)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should error when the Cloud Run service doesn't exist", async () => {
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/empty")
      .reply(404, { error: "service doesn't exist" });

    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator({ run: { serviceId: "empty" } });
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(500, /service doesn't exist/g)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should error when the Cloud Run service doesn't exist", async () => {
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/badService")
      .reply(200, { status: {} });

    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator({ run: { serviceId: "badService" } });
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(500, /Cloud Run URL doesn't exist/g)
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  }).timeout(2500);

  it("should resolve a function returns middleware that proxies to the live version", async () => {
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/")
      .reply(200, "live version");

    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should pass on provided headers to the origin", async () => {
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin, { reqheaders: { "x-custom-header": "cooooookie-crisp" } })
      .get("/")
      .reply(200, "live version");

    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator(fakeRewrite);
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .set("x-custom-header", "cooooookie-crisp")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should resolve to a live version in another region", async () => {
    const cloudRunServiceOriginAsia = "https://helloworld-hash-as.a.run.app";
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/asia-southeast1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOriginAsia } });
    nock(cloudRunServiceOriginAsia)
      .get("/")
      .reply(200, "live version");

    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator({ run: { serviceId: "helloworld", region: "asia-southeast1" } });
    const spyMw = sinon.spy(mw);

    return supertest(spyMw)
      .get("/")
      .expect(200, "live version")
      .then(() => {
        expect(spyMw.calledOnce).to.be.true;
      });
  });

  it("should cache calls to look up Cloud Run service URLs", async () => {
    const multiCallOrigin = "https://multiLookup-hash-uc.a.run.app";
    const multiNock = nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/multiLookup")
      .reply(200, { status: { url: multiCallOrigin } });
    nock(multiCallOrigin)
      .persist() // Gets called multiple times
      .get("/")
      .reply(200, "live version");

    const mwGenerator = cloudRunProxy(fakeOptions);
    const mw = await mwGenerator({ run: { serviceId: "multiLookup" } });
    const spyMw = sinon.spy(mw);

    await supertest(spyMw)
      .get("/")
      .expect(200, "live version");
    expect(spyMw.calledOnce).to.be.true;
    expect(multiNock.isDone()).to.be.true;

    // New rewrite for the same Cloud Run service
    const failMultiNock = nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/multiLookup")
      .reply(500, "should not happen");

    const mw2Generator = cloudRunProxy(fakeOptions);
    const mw2 = await mw2Generator({ run: { serviceId: "multiLookup" } });
    const spyMw2 = sinon.spy(mw2);

    await supertest(spyMw2)
      .get("/")
      .expect(200, "live version");
    expect(spyMw2.calledOnce).to.be.true;
    expect(failMultiNock.isDone()).to.be.false;

    // Second hit to the same path
    await supertest(spyMw2)
      .get("/")
      .expect(200, "live version");
    expect(spyMw2.calledTwice).to.be.true;
    expect(failMultiNock.isDone()).to.be.false;
  });

  it("should pass through normal 404 errors", async () => {
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/404.html")
      .reply(404, "normal 404");

    const mwGenerator = cloudRunProxy(fakeOptions);
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
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/404-cascade.html")
      .reply(404, "normal 404 with cascade", { "x-cascade": "pass" });

    const mwGenerator = cloudRunProxy(fakeOptions);
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
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/cached")
      .reply(200, "cached page", { "cache-control": "custom", "set-cookie": "nom" });

    const mwGenerator = cloudRunProxy(fakeOptions);
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
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/vary")
      .reply(200, "live vary version", { vary: "Other, Authorization" });

    const mwGenerator = cloudRunProxy(fakeOptions);
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
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/500")
      .replyWithError({ message: "normal error" });

    const mwGenerator = cloudRunProxy(fakeOptions);
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
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/timeout")
      .replyWithError({ message: "ahh", code: "ETIMEDOUT" });

    const mwGenerator = cloudRunProxy(fakeOptions);
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
    nock(cloudRunApiOrigin)
      .get("/v1/projects/project-foo/locations/us-central1/services/helloworld")
      .reply(200, { status: { url: cloudRunServiceOrigin } });
    nock(cloudRunServiceOrigin)
      .get("/sockettimeout")
      .replyWithError({ message: "ahh", code: "ESOCKETTIMEDOUT" });

    const mwGenerator = cloudRunProxy(fakeOptions);
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
