import { createServer, Server } from "http";
import { expect } from "chai";
import * as nock from "nock";
import AbortController from "abort-controller";
const proxySetup = require("proxy");

import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { streamToString, stringToStream } from "../utils";

describe("apiv2", () => {
  beforeEach(() => {
    // The api module has package variables that we don't want sticking around.
    delete require.cache[require.resolve("../apiv2")];

    nock.cleanAll();
  });

  after(() => {
    delete require.cache[require.resolve("../apiv2")];
  });

  describe("request", () => {
    it("should throw on a basic 404 GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(404, { message: "not found" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      await expect(r).to.eventually.be.rejectedWith(FirebaseError, /Not Found/);
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to resolve on a 404 GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(404, { message: "not found" });

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
      nock("https://example.com").get("/path/to/foo").reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to handle specified retry codes", async () => {
      nock("https://example.com").get("/path/to/foo").once().reply(503, {});
      nock("https://example.com").get("/path/to/foo").once().reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
        retryCodes: [503],
        retries: 1,
        retryMinTimeout: 10,
        retryMaxTimeout: 15,
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should return an error if the retry never succeeds", async () => {
      nock("https://example.com").get("/path/to/foo").twice().reply(503, {});

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request({
        method: "GET",
        path: "/path/to/foo",
        retryCodes: [503],
        retries: 1,
        retryMinTimeout: 10,
        retryMaxTimeout: 15,
      });
      await expect(r).to.eventually.be.rejectedWith(FirebaseError, /503.+Error/);
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to resolve the error response if retry codes never succeed", async () => {
      nock("https://example.com").get("/path/to/foo").twice().reply(503, {});

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
        resolveOnHTTPError: true,
        retryCodes: [503],
        retries: 1,
        retryMinTimeout: 10,
        retryMaxTimeout: 15,
      });
      expect(r.status).to.equal(503);
      expect(nock.isDone()).to.be.true;
    });

    it("should not allow resolving on http error when streaming", async () => {
      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request<unknown, NodeJS.ReadableStream>({
        method: "GET",
        path: "/path/to/foo",
        responseType: "stream",
        resolveOnHTTPError: false,
      });
      await expect(r).to.eventually.be.rejectedWith(FirebaseError, /streaming.+resolveOnHTTPError/);
    });

    it("should be able to stream a GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(200, "ablobofdata");

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request<unknown, NodeJS.ReadableStream>({
        method: "GET",
        path: "/path/to/foo",
        responseType: "stream",
        resolveOnHTTPError: true,
      });
      const data = await streamToString(r.body);
      expect(data).to.deep.equal("ablobofdata");
      expect(nock.isDone()).to.be.true;
    });

    it("should set a bearer token to 'owner' if making an insecure, local request", async () => {
      nock("http://localhost")
        .get("/path/to/foo")
        .matchHeader("Authorization", "Bearer owner")
        .reply(200, { request: "insecure" });

      const c = new Client({ urlPrefix: "http://localhost" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal({ request: "insecure" });
      expect(nock.isDone()).to.be.true;
    });

    it("should error with a FirebaseError if JSON is malformed", async () => {
      nock("https://example.com").get("/path/to/foo").reply(200, `{not:"json"}`);

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      await expect(r).to.eventually.be.rejectedWith(FirebaseError);
      expect(nock.isDone()).to.be.true;
    });

    it("should error with a FirebaseError if an error happens", async () => {
      nock("https://example.com").get("/path/to/foo").replyWithError("boom");

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      await expect(r).to.eventually.be.rejectedWith(FirebaseError, /Failed to make request.+/);
      expect(nock.isDone()).to.be.true;
    });

    it("should error with a FirebaseError if an invalid responseType is provided", async () => {
      nock("https://example.com").get("/path/to/foo").reply(200, "");

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = c.request({
        method: "GET",
        path: "/path/to/foo",
        // Don't really do this. This is for testing only.
        responseType: "notjson" as "json",
      });
      await expect(r).to.eventually.be.rejectedWith(
        FirebaseError,
        /Unable to interpret response.+/,
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve a 400 GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(400, "who dis?");

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request<unknown, NodeJS.ReadableStream>({
        method: "GET",
        path: "/path/to/foo",
        responseType: "stream",
        resolveOnHTTPError: true,
      });
      expect(r.status).to.equal(400);
      expect(await streamToString(r.body)).to.equal("who dis?");
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve a 404 GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(404, "not here");

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request<unknown, NodeJS.ReadableStream>({
        method: "GET",
        path: "/path/to/foo",
        responseType: "stream",
        resolveOnHTTPError: true,
      });
      expect(r.status).to.equal(404);
      expect(await streamToString(r.body)).to.equal("not here");
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to resolve a stream on a 404 GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(404, "does not exist");

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request<unknown, NodeJS.ReadableStream>({
        method: "GET",
        path: "/path/to/foo",
        responseType: "stream",
        resolveOnHTTPError: true,
      });
      const data = await streamToString(r.body);
      expect(data).to.deep.equal("does not exist");
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request if path didn't include a leading slash", async () => {
      nock("https://example.com").get("/path/to/foo").reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request if urlPrefix did have a trailing slash", async () => {
      nock("https://example.com").get("/path/to/foo").reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com/" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic GET request with an api version", async () => {
      nock("https://example.com").get("/v1/path/to/foo").reply(200, { foo: "bar" });

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

    it("should make a basic GET request and not override the user-agent", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .matchHeader("user-agent", "unit tests, silly")
        .reply(200, { success: true });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
        headers: { "user-agent": "unit tests, silly" },
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });

    it("should handle a 204 response with no data", async () => {
      nock("https://example.com").get("/path/to/foo").reply(204);

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
      });
      expect(r.body).to.deep.equal(undefined);
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to time out if the request takes too long", async () => {
      nock("https://example.com").get("/path/to/foo").delay(200).reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com/" });
      await expect(
        c.request({
          method: "GET",
          path: "/path/to/foo",
          timeout: 10,
        }),
      ).to.eventually.be.rejectedWith(FirebaseError, "Timeout reached making request");
      expect(nock.isDone()).to.be.true;
    });

    it("should be able to be killed by a signal", async () => {
      nock("https://example.com").get("/path/to/foo").delay(200).reply(200, { foo: "bar" });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);
      const c = new Client({ urlPrefix: "https://example.com/" });
      await expect(
        c.request({
          method: "GET",
          path: "/path/to/foo",
          signal: controller.signal,
        }),
      ).to.eventually.be.rejectedWith(FirebaseError, "Timeout reached making request");
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic POST request", async () => {
      const POST_DATA = { post: "data" };
      nock("https://example.com")
        .matchHeader("Content-Type", "application/json")
        .post("/path/to/foo", POST_DATA)
        .reply(200, { success: true });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "POST",
        path: "/path/to/foo",
        body: POST_DATA,
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic POST request without overriding Content-Type", async () => {
      const POST_DATA = { post: "data" };
      nock("https://example.com")
        .matchHeader("Content-Type", "application/json+customcontent")
        .post("/path/to/foo", POST_DATA)
        .reply(200, { success: true });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "POST",
        path: "/path/to/foo",
        body: POST_DATA,
        headers: { "Content-Type": "application/json+customcontent" },
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic POST request with a stream", async () => {
      nock("https://example.com").post("/path/to/foo", "hello world").reply(200, { success: true });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "POST",
        path: "/path/to/foo",
        body: stringToStream("hello world"),
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });

    it("should preserve XML messages", async () => {
      const xml = "<?xml version='1.0' encoding='UTF-8'?><Message>Hello!</Message>";
      nock("https://example.com").get("/path/to/foo").reply(200, xml);

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.request({
        method: "GET",
        path: "/path/to/foo",
        responseType: "xml",
      });
      expect(r.body).to.deep.equal(xml);
      expect(nock.isDone()).to.be.true;
    });

    it("should preserve XML messages on error", async () => {
      const xml =
        "<?xml version='1.0' encoding='UTF-8'?><Error><Code>EntityTooLarge</Code></Error>";
      nock("https://example.com").get("/path/to/foo").reply(400, xml);

      const c = new Client({ urlPrefix: "https://example.com" });
      await expect(
        c.request({
          method: "GET",
          path: "/path/to/foo",
          responseType: "xml",
        }),
      ).to.eventually.be.rejectedWith(FirebaseError, /EntityTooLarge/);
      expect(nock.isDone()).to.be.true;
    });

    describe("with a proxy", () => {
      let proxyServer: Server;
      let targetServer: Server;
      let oldProxy: string | undefined;
      before(async () => {
        proxyServer = proxySetup(createServer());
        targetServer = createServer((req, res) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ proxied: true }));
        });
        await Promise.all([
          new Promise<void>((resolve) => {
            proxyServer.listen(52672, () => resolve());
          }),
          new Promise<void>((resolve) => {
            targetServer.listen(52673, () => resolve());
          }),
        ]);
        oldProxy = process.env.HTTP_PROXY;
        process.env.HTTP_PROXY = "http://127.0.0.1:52672";
      });

      after(async () => {
        await Promise.all([
          new Promise((resolve) => proxyServer.close(resolve)),
          new Promise((resolve) => targetServer.close(resolve)),
        ]);
        process.env.HTTP_PROXY = oldProxy;
      });

      it("should be able to make a basic GET request", async () => {
        const c = new Client({
          urlPrefix: "http://127.0.0.1:52673",
        });
        const r = await c.request({
          method: "GET",
          path: "/path/to/foo",
        });
        expect(r.body).to.deep.equal({ proxied: true });
        expect(nock.isDone()).to.be.true;
      });
    });
  });

  describe("verbs", () => {
    it("should make a GET request", async () => {
      nock("https://example.com").get("/path/to/foo").reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.get("/path/to/foo");
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a POST request", async () => {
      const POST_DATA = { post: "data" };
      nock("https://example.com").post("/path/to/foo", POST_DATA).reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.post("/path/to/foo", POST_DATA);
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a PUT request", async () => {
      const DATA = { post: "data" };
      nock("https://example.com").put("/path/to/foo", DATA).reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.put("/path/to/foo", DATA);
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a PATCH request", async () => {
      const DATA = { post: "data" };
      nock("https://example.com").patch("/path/to/foo", DATA).reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.patch("/path/to/foo", DATA);
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a DELETE request", async () => {
      nock("https://example.com").delete("/path/to/foo").reply(200, { foo: "bar" });

      const c = new Client({ urlPrefix: "https://example.com" });
      const r = await c.delete("/path/to/foo");
      expect(r.body).to.deep.equal({ foo: "bar" });
      expect(nock.isDone()).to.be.true;
    });
  });
});
