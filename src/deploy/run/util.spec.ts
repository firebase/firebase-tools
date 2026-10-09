import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { getExistingService } from "./util";

describe("run util", () => {
  afterEach(() => sinon.restore());

  describe("getExistingService", () => {
    it("returns the service when it exists", async () => {
      const svc = { name: "projects/p/locations/r/services/s" } as runv2.Service;
      sinon.stub(runv2, "getService").resolves(svc);
      expect(await getExistingService("p", "r", "s")).to.equal(svc);
    });

    it("returns undefined for services that don't exist", async () => {
      sinon.stub(runv2, "getService").rejects({ status: 404 });
      expect(await getExistingService("p", "r", "s")).to.be.undefined;
    });

    it("rethrows other errors", async () => {
      sinon.stub(runv2, "getService").rejects({ status: 403 });
      await expect(getExistingService("p", "r", "s")).to.be.rejected;
    });
  });
});
