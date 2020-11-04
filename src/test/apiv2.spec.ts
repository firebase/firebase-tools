import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import * as helpers from "./helpers";

describe("apiv2", () => {
  beforeEach(() => {
    // The api module has package variables that we don't want sticking around.
    delete require.cache[require.resolve("../apiv2")];
  });

  after(() => {
    delete require.cache[require.resolve("../apiv2")];
  });

  describe("request", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
      sandbox = sinon.createSandbox();
      helpers.mockAuth(sandbox);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should throw on a basic 404 GET request", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(404, { message: "not found" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      await expect(r).to.eventually.be.rejectedWith(FirebaseError, /Not Found/);
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to resolve on a 404 GET request", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(404, { message: "not found" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
        resolveOnHTTPError: true,
      });
      expect(r.status).to.equal(404);
      expect(r.body).to.deep.equal({ message: "not found" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request if path didn't include a leading slash", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request if urlPrefix did have a trailing slash", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com/" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request with an api version", async () => {
      nock("https://example.com")
        .get("/v1/path/to/foo")
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com", apiVersion: "v1" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request with a query string", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .query({ key: "value" })
        .reply(200, { success: true });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
        queryParams: { key: "value" },
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic POST request", async () => {
      const POST_DATA = { post: "data" };
      nock("https://example.com")
        .post("/path/to/foo", POST_DATA)
        .reply(200, { success: true });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "POST",
        path: "/path/to/foo",
        json: POST_DATA,
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("verbs", () => {
    let sandbox: sinon.SinonSandbox;
    beforeEach(() => {
      sandbox = sinon.createSandbox();
      helpers.mockAuth(sandbox);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should make a GET request", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.get("/path/to/foo");
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a POST request", async () => {
      const POST_DATA = { post: "data" };
      nock("https://example.com")
        .post("/path/to/foo", POST_DATA)
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.post("/path/to/foo", POST_DATA);
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a PATCH request", async () => {
      const DATA = { post: "data" };
      nock("https://example.com")
        .patch("/path/to/foo", DATA)
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.patch("/path/to/foo", DATA);
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a DELETE request", async () => {
      nock("https://example.com")
        .delete("/path/to/foo")
        .reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.delete("/path/to/foo");
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });
  });
});
