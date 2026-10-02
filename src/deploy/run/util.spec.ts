import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import {
  copyTemplate,
  deployRevision,
  getExistingService,
  getServiceConfigs,
  toAppHostingConfig,
} from "./util";

describe("run util", () => {
  afterEach(() => sinon.restore());

  describe("getServiceConfigs", () => {
    const a = { serviceId: "a", region: "us-central1" };
    const b = { serviceId: "b", region: "us-east1" };
    const opts = (run: unknown, only?: string) => ({ config: { src: { run } }, only }) as Options;

    it("returns all services when --only is 'run' or unset", () => {
      expect(getServiceConfigs(opts([a, b], "run"))).to.deep.equal([a, b]);
      expect(getServiceConfigs(opts(a))).to.deep.equal([a]);
      expect(getServiceConfigs(opts(undefined))).to.deep.equal([]);
    });

    it("filters to services named in --only", () => {
      expect(getServiceConfigs(opts([a, b], "hosting,run:b"))).to.deep.equal([b]);
    });

    it("throws when --only names a service not in firebase.json", () => {
      expect(() => getServiceConfigs(opts([a], "run:a,run:missing"))).to.throw(
        "Cloud Run service IDs missing not detected in firebase.json",
      );
    });
  });

  describe("toAppHostingConfig", () => {
    it("adapts RunSingle to AppHostingSingle and defaults rootDir to empty string", () => {
      expect(
        toAppHostingConfig({
          serviceId: "s",
          region: "us-central1",
          ignore: ["node_modules"],
          localBuild: true,
        }),
      ).to.deep.equal({
        backendId: "s",
        rootDir: "",
        ignore: ["node_modules"],
        localBuild: true,
      });
    });
  });

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

  describe("copyTemplate and deployRevision", () => {
    it("clones the template without the revision name and sends 100% traffic to LATEST", async () => {
      const updateStub = sinon.stub(runv2, "updateService").resolves({} as runv2.Service);
      const service = {
        name: "projects/p/locations/r/services/s",
        template: { revision: "s-001", containers: [{ name: "s", image: "old" }] },
        traffic: [
          { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "s-001", percent: 100 },
          {
            type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION",
            revision: "s-001",
            tag: "canary",
            percent: 0,
          },
        ],
      } as unknown as runv2.Service;

      const template = copyTemplate(service);
      template.containers![0].image = "new";
      await deployRevision(service, template);

      expect(service.template.revision).to.equal("s-001");
      expect(service.template.containers![0].image).to.equal("old");
      expect(updateStub).to.have.been.calledWith(
        {
          name: "projects/p/locations/r/services/s",
          template: { containers: [{ name: "s", image: "new" }] },
          traffic: [
            { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 },
            { type: "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION", revision: "s-001", tag: "canary" },
          ],
        },
        {
          updateMask: ["template", "traffic"],
          pollTimeoutMs: 600000,
        },
      );
    });
  });
});
