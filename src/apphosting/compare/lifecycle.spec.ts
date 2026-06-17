import { expect } from "chai";
import * as sinon from "sinon";
import * as apphosting from "../../gcp/apphosting";
import { validateProject, runGarbageCollection } from "./lifecycle";

describe("Lifecycle Manager", () => {
  let listBackendsStub: sinon.SinonStub;
  let updateBackendStub: sinon.SinonStub;

  beforeEach(() => {
    listBackendsStub = sinon.stub(apphosting, "listBackends");
    updateBackendStub = sinon.stub(apphosting, "updateBackend");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("validateProject", () => {
    it("should allow whitelisted projects", () => {
      expect(() => validateProject("aryanf-test")).to.not.throw();
      expect(() => validateProject("pretend-public")).to.not.throw();
    });

    it("should throw on non-whitelisted projects", () => {
      expect(() => validateProject("my-secret-project")).to.throw(
        /Invalid project ID "my-secret-project"/
      );
    });
  });

  describe("runGarbageCollection", () => {
    it("should unlock stale busy backends (> 2 hours)", async () => {
      const now = Date.now();
      const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000).toISOString();
      const oneHourAgo = new Date(now - 1 * 60 * 60 * 1000).toISOString();

      listBackendsStub.resolves({
        backends: [
          {
            name: "projects/test/locations/us-central1/backends/compare-slot-1-a",
            labels: { status: "busy", type: "comparison-sandbox" },
            updateTime: threeHoursAgo
          },
          {
            name: "projects/test/locations/us-central1/backends/compare-slot-1-b",
            labels: { status: "busy", type: "comparison-sandbox" },
            updateTime: oneHourAgo
          }
        ]
      });

      updateBackendStub.resolves({ name: "op-name" });

      await runGarbageCollection("aryanf-test", "us-central1");

      expect(updateBackendStub.callCount).to.equal(1);
      const args = updateBackendStub.firstCall.args;
      expect(args[2]).to.equal("compare-slot-1-a");
      expect(args[3].labels.status).to.equal("idle");
    });
  });
});
