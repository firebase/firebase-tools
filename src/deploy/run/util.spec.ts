import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import {
  deployRevision,
  getExistingService,
  getServiceConfigs,
  mainContainer,
  SERVICE_OPERATION_TIMEOUT_MS,
} from "./util";

describe("run util", () => {
  afterEach(() => sinon.restore());

  describe("getServiceConfigs", () => {
    const a = { serviceId: "a", region: "us-central1" };
    const b = { serviceId: "b", region: "us-east1" };
    const options = (run: unknown, only?: string): Options =>
      ({ config: { src: { run } }, only }) as unknown as Options;

    it("returns every service when not filtering", () => {
      expect(getServiceConfigs(options([a, b]))).to.deep.equal([a, b]);
      expect(getServiceConfigs(options([a, b], "hosting,run"))).to.deep.equal([a, b]);
      expect(getServiceConfigs(options(a))).to.deep.equal([a]);
      expect(getServiceConfigs(options(undefined))).to.deep.equal([]);
    });

    it("filters by service ID", () => {
      expect(getServiceConfigs(options([a, b], "run:b"))).to.deep.equal([b]);
    });

    it("throws for services that aren't in firebase.json", () => {
      expect(() => getServiceConfigs(options([a], "run:a,run:c"))).to.throw(
        "Cloud Run service IDs c not detected in firebase.json",
      );
    });
  });

  describe("getExistingService", () => {
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

  describe("deployRevision", () => {
    const service = {
      name: "projects/p/locations/r/services/s",
      traffic: [
        { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 80 },
        { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "s-1", percent: 20 },
        {
          type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
          revision: "s-1",
          percent: 0,
          tag: "staging",
        },
      ],
    } as unknown as runv2.Service;
    const template = { containers: [{ name: "c", image: "i" }] };

    it("sends all traffic to the new revision and keeps revision tags", async () => {
      const update = sinon.stub(runv2, "updateService").resolves();
      await deployRevision(service, template, { "firebase.google.com/app-id": "app" });
      expect(update).to.have.been.calledWith(
        {
          name: service.name,
          annotations: { "firebase.google.com/app-id": "app" },
          template,
          traffic: [
            { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
            { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "s-1", tag: "staging" },
          ],
        },
        {
          updateMask: ["annotations", "template", "traffic"],
          masterTimeout: SERVICE_OPERATION_TIMEOUT_MS,
        },
      );
    });
  });
});
