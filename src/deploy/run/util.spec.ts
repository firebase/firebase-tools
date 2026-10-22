import { expect } from "chai";
import * as sinon from "sinon";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import * as utils from "../../utils";
import { getExistingService, getServiceConfigs } from "./util";

describe("run util", () => {
  afterEach(() => sinon.restore());

  describe("getServiceConfigs", () => {
    const web = { serviceId: "web", region: "us-central1" };
    const webEurope = { serviceId: "web", region: "europe-west1" };
    const api = { serviceId: "api", region: "us-east1" };
    const options = (run: unknown, only?: string) =>
      ({ config: { src: { run } }, only }) as Options;
    let logStub: sinon.SinonStub;

    beforeEach(() => {
      logStub = sinon.stub(utils, "logLabeledBullet");
    });

    it("returns every service for --only run, or without --only", () => {
      expect(getServiceConfigs(options([web, api], "run"))).to.deep.equal([web, api]);
      expect(getServiceConfigs(options(web))).to.deep.equal([web]);
      expect(getServiceConfigs(options(undefined))).to.deep.equal([]);
    });

    it("returns the services that --only names", () => {
      expect(getServiceConfigs(options([web, api], "hosting,run:api"))).to.deep.equal([api]);
      expect(logStub).not.to.have.been.called;
    });

    it("returns a service ID in every region it's listed in, and says so", () => {
      expect(getServiceConfigs(options([web, api, webEurope], "run:web"))).to.deep.equal([
        web,
        webEurope,
      ]);
      expect(logStub).to.have.been.calledOnceWithExactly(
        "run",
        "run:web matches 2 services in firebase.json: web:us-central1, web:europe-west1. " +
          "Deploying all of them. To deploy just one, use --only run:web:<region>.",
      );
    });

    it("returns one service for run:<serviceId>:<region>", () => {
      expect(getServiceConfigs(options([web, webEurope], "run:web:europe-west1"))).to.deep.equal([
        webEurope,
      ]);
      expect(logStub).not.to.have.been.called;
    });

    it("returns each service once, in firebase.json order", () => {
      const only = "run:api,run:web:europe-west1,run:web";
      expect(getServiceConfigs(options([web, api, webEurope], only))).to.deep.equal([
        web,
        api,
        webEurope,
      ]);
    });

    it("throws if --only names a service that isn't in firebase.json", () => {
      expect(() => getServiceConfigs(options([web], "run:web,run:api"))).to.throw(
        "Cloud Run service api not detected in firebase.json.",
      );
      expect(() => getServiceConfigs(options([web], "run:web:us-east1"))).to.throw(
        "Cloud Run service web:us-east1 not detected in firebase.json.",
      );
    });

    it("rejects malformed service names", () => {
      for (const name of ["", ":us-central1", "web:", "web:us-central1:extra"]) {
        expect(() => getServiceConfigs(options([web], `run:${name}`))).to.throw(
          `Invalid Cloud Run service "${name}". Use <serviceId> or <serviceId>:<region>.`,
        );
      }
    });

    it("throws if a service in firebase.json has no region", () => {
      expect(() => getServiceConfigs(options([web, { serviceId: "api" }], "run:web"))).to.throw(
        "Cloud Run service api is missing a region in firebase.json.",
      );
    });

    it("throws if firebase.json lists the same service twice", () => {
      expect(() =>
        getServiceConfigs(options([web, webEurope, { ...web, rootDir: "web" }])),
      ).to.throw("Cloud Run service web:us-central1 is listed more than once in firebase.json.");
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
});
