import { expect } from "chai";
import * as supertest from "supertest";
import { EmulatorHub } from "./hub";

describe("EmulatorHub", () => {
  let hub: EmulatorHub;
  let app: any;

  before(async () => {
    hub = new EmulatorHub({
      projectId: "test-project",
      listen: [{ address: "127.0.0.1", port: 4400, family: "IPv4" }],
      listenForEmulator: {} as any,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    app = await (hub as any).createExpressApp();
  });

  describe("PATH_EXPORT", () => {
    it("should reject external requests with 403 when origin header is present", async () => {
      const res = await supertest(app)
        .post(EmulatorHub.PATH_EXPORT)
        .set("origin", "http://malicious.example.com")
        .send({ path: "/tmp/export" });

      expect(res.status).to.equal(403);
      expect(res.body).to.deep.equal({
        message: "Export cannot be triggered by external callers.",
      });
    });
  });

  describe("PATH_CLEAR_DATA_CONNECT", () => {
    it("should reject external requests with 403 when origin header is present", async () => {
      const res = await supertest(app)
        .post(EmulatorHub.PATH_CLEAR_DATA_CONNECT)
        .set("origin", "http://malicious.example.com");

      expect(res.status).to.equal(403);
      expect(res.body).to.deep.equal({
        message: "Clear SQL Connect cannot be triggered by external callers.",
      });
    });
  });
});
