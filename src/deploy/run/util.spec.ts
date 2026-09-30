import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { getExistingService, mainContainer } from "./util";

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

  describe("mainContainer", () => {
    it("returns the container with ports, or else the first one", () => {
      const sidecar = { name: "sidecar", image: "s" };
      const main = { name: "main", image: "m", ports: [{ containerPort: 8080 }] };
      expect(mainContainer({ containers: [sidecar, main] })).to.equal(main);
      expect(mainContainer({ containers: [sidecar] })).to.equal(sidecar);
      expect(mainContainer(undefined)).to.be.undefined;
    });
  });
});
