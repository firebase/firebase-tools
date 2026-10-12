import { expect } from "chai";
import * as sinon from "sinon";
import { Endpoint } from "../backend";
import * as database from "./database";
import * as databaseManagement from "../../../management/database";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "google.firebase.database.ref.v1.written",
    eventFilters: {},
    eventFilterPathPatterns: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("database service", () => {
  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("ensureDatabaseTriggerRegion", () => {
    it("should set the trigger location to the function region", async () => {
      const ep = { ...endpoint };

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
    });

    it("should not error if the trigger location is already set correctly", async () => {
      const ep = { ...endpoint };
      ep.eventTrigger.region = "us-central1";

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
    });

    it("should error if the trigger location is set incorrectly", () => {
      const ep = { ...endpoint };
      ep.eventTrigger.region = "us-west1";

      expect(() => database.ensureDatabaseTriggerRegion(ep)).to.throw(
        "A database trigger location must match the function region.",
      );
    });
  });

  describe("getDatabaseInstanceDetails", () => {
    let instanceStub: sinon.SinonStub;

    beforeEach(() => {
      database.clearCache();
      instanceStub = sinon
        .stub(databaseManagement, "getDatabaseInstanceDetails")
        .throws("unexpected call to getDatabaseInstanceDetails");
    });

    it("should cache instance details lookups to prevent multiple API calls", async () => {
      const detailsResp = { location: "us-central1" } as any;
      instanceStub.resolves(detailsResp);

      const d1 = await database.getDatabaseInstanceDetails(projectNumber, "instance1");
      const d2 = await database.getDatabaseInstanceDetails(projectNumber, "instance1");

      expect(d1).to.deep.equal(detailsResp);
      expect(d2).to.deep.equal(detailsResp);
      expect(instanceStub).to.have.been.calledOnce;
    });

    it("should make separate API calls for different instances", async () => {
      instanceStub.onFirstCall().resolves({ location: "us-central1" });
      instanceStub.onSecondCall().resolves({ location: "europe-west1" });

      const d1 = await database.getDatabaseInstanceDetails(projectNumber, "instance1");
      const d2 = await database.getDatabaseInstanceDetails(projectNumber, "instance2");

      expect(d1.location).to.eq("us-central1");
      expect(d2.location).to.eq("europe-west1");
      expect(instanceStub).to.have.been.calledTwice;
    });
  });
});
