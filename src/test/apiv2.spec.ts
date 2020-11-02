import { expect } from "chai";
import * as nock from "nock";
import * as sinon from "sinon";

import * as apiv2 from "../apiv2";
import { FirebaseError } from "../error";
import * as scopes from "../scopes";
import * as helpers from "./helpers";

describe("apiv2", () => {
  beforeEach(() => {
    // The api module has package variables that we don't want sticking around.
    delete require.cache[require.resolve("../apiv2")];
  });

  after(() => {
    delete require.cache[require.resolve("../apiv2")];
  });

  describe("setScopes", () => {
    it("should not duplicate default scopes", () => {
      apiv2.setScopes([scopes.EMAIL, scopes.EMAIL]);
      const s = apiv2.getScopes();
      expect(s).to.have.length(4);
      expect(s).to.contain(scopes.OPENID);
      expect(s).to.contain(scopes.EMAIL);
      expect(s).to.contain(scopes.CLOUD_PROJECTS_READONLY);
      expect(s).to.contain(scopes.FIREBASE_PLATFORM);
    });

    it("should add new scopes", () => {
      apiv2.setScopes([scopes.CLOUD_STORAGE]);
      const s = apiv2.getScopes();
      expect(s).to.have.length(5);
      expect(s).to.contain(scopes.OPENID);
      expect(s).to.contain(scopes.EMAIL);
      expect(s).to.contain(scopes.CLOUD_PROJECTS_READONLY);
      expect(s).to.contain(scopes.FIREBASE_PLATFORM);
      expect(s).to.contain(scopes.CLOUD_STORAGE);
    });
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

    it("should error without a baseURL", async () => {
      await expect(
        apiv2.request({ method: "GET", baseURL: "", path: "/path/to/foo" })
      ).to.eventually.rejectedWith(FirebaseError, /without a baseURL/);
    });

    it("should error without a path", async () => {
      await expect(
        apiv2.request({ method: "GET", baseURL: "https://example.com", path: "" })
      ).to.eventually.rejectedWith(FirebaseError, /undefined path/);
    });

    it("should make a basic GET request", async () => {
      nock("https://example.com")
        .get("/path/to/foo")
        .reply(200, { foo: "bar" });

      const r = await apiv2.request({
        baseURL: "https://example.com",
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

      const r = await apiv2.request({
        baseURL: "https://example.com",
        path: "/path/to/foo",
        searchParams: { key: "value" },
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });

    it("should make a basic POST request", async () => {
      const POST_DATA = { post: "data" };
      nock("https://example.com")
        .post("/path/to/foo", POST_DATA)
        .reply(200, { success: true });

      const r = await apiv2.request({
        method: "POST",
        baseURL: "https://example.com",
        path: "/path/to/foo",
        json: POST_DATA,
      });
      expect(r.body).to.deep.equal({ success: true });
      expect(nock.isDone()).to.be.true;
    });
  });
});
