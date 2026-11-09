import { expect } from "chai";
import type { Express } from "express";
import * as sinon from "sinon";
import * as supertest from "supertest";
import { EmulatorHub, EmulatorHubArgs } from "./hub";
import { HubExport } from "./hubExport";
import { EmulatorRegistry } from "./registry";

describe("EmulatorHub", () => {
  let app: Express;
  let exportAll: sinon.SinonStub;
  let registryGet: sinon.SinonStub;

  beforeEach(async () => {
    exportAll = sinon.stub(HubExport.prototype, "exportAll").resolves();
    registryGet = sinon.stub(EmulatorRegistry, "get").returns(undefined);
    const hub = new EmulatorHub({
      projectId: "test-project",
      listen: [{ address: "127.0.0.1", port: 4400, family: "IPv4" }],
      listenForEmulator: {} as EmulatorHubArgs["listenForEmulator"],
    });
    app = await hub["createExpressApp"]();
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("PATH_EXPORT", () => {
    it("should reject external requests with 403 without exporting", async () => {
      const res = await supertest(app)
        .post(EmulatorHub.PATH_EXPORT)
        .set("origin", "http://malicious.example.com")
        .send({ path: "/tmp/export" });

      expect(res.status).to.equal(403);
      expect(res.body).to.deep.equal({
        message: "Export cannot be triggered by external callers.",
      });
      expect(exportAll).to.not.have.been.called;
    });
  });

  describe("PATH_CLEAR_DATA_CONNECT", () => {
    it("should reject external requests with 403 without clearing data", async () => {
      const res = await supertest(app)
        .post(EmulatorHub.PATH_CLEAR_DATA_CONNECT)
        .set("origin", "http://malicious.example.com");

      expect(res.status).to.equal(403);
      expect(res.body).to.deep.equal({
        message: "Clear SQL Connect cannot be triggered by external callers.",
      });
      expect(registryGet).to.not.have.been.called;
    });
  });
});
