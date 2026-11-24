import { expect } from "chai";
import * as sinon from "sinon";
import { Endpoint, EventTrigger, EventTriggered } from "../backend";
import * as database from "./database";
import * as databaseManagement from "../../../management/database";
import { logger } from "../../../logger";

const projectNumber = "123456789";

function databaseEndpoint(eventTrigger: Partial<EventTrigger> = {}): Endpoint & EventTriggered {
  return {
    id: "endpoint",
    region: "us-central1",
    project: projectNumber,
    eventTrigger: {
      retry: false,
      eventType: "google.firebase.database.ref.v1.written",
      eventFilters: {},
      eventFilterPathPatterns: { ref: "messages/{id}", instance: "*" },
      ...eventTrigger,
    },
    entryPoint: "endpoint",
    platform: "gcfv2",
    runtime: "nodejs16",
  };
}

function namedInstanceEndpoint(instance = "my-instance"): Endpoint & EventTriggered {
  return databaseEndpoint({
    eventFilters: { instance },
    eventFilterPathPatterns: { ref: "messages/{id}" },
  });
}

describe("database service", () => {
  afterEach(() => {
    sinon.verifyAndRestore();
  });

  describe("ensureDatabaseTriggerRegion", () => {
    let instanceStub: sinon.SinonStub;
    let warnStub: sinon.SinonStub;
    let debugStub: sinon.SinonStub;

    beforeEach(() => {
      database.clearCache();
      instanceStub = sinon
        .stub(databaseManagement, "getDatabaseInstanceDetails")
        .throws("unexpected call to getDatabaseInstanceDetails");
      warnStub = sinon.stub(logger, "warn");
      debugStub = sinon.stub(logger, "debug");
    });

    it("should set the trigger region to the location of a named instance in another region", async () => {
      instanceStub.resolves({ location: "europe-west1" });
      const ep = namedInstanceEndpoint();

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("europe-west1");
      expect(ep.region).to.eq("us-central1");
      expect(instanceStub).to.have.been.calledOnceWith(projectNumber, "my-instance");
      expect(warnStub).not.to.have.been.called;
    });

    it("should set the trigger region to the function region for a named instance in the same region", async () => {
      instanceStub.resolves({ location: "us-central1" });
      const ep = namedInstanceEndpoint();

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
      expect(warnStub).not.to.have.been.called;
    });

    it("should read a named instance from eventFilterPathPatterns", async () => {
      instanceStub.resolves({ location: "asia-southeast1" });
      const ep = databaseEndpoint({
        eventFilterPathPatterns: { ref: "messages/{id}", instance: "my-instance" },
      });

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("asia-southeast1");
    });

    it("should use the function region for the default instance pattern without a lookup", async () => {
      const ep = databaseEndpoint();
      expect(ep.eventTrigger.eventFilterPathPatterns?.instance).to.eq("*");

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
      expect(instanceStub).not.to.have.been.called;
      expect(warnStub).not.to.have.been.called;
    });

    it("should use the function region for a partial instance pattern without a lookup", async () => {
      const ep = databaseEndpoint({
        eventFilterPathPatterns: { ref: "messages/{id}", instance: "my-*" },
      });

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
      expect(instanceStub).not.to.have.been.called;
    });

    it("should use the function region without a lookup if there is no instance filter", async () => {
      const ep = databaseEndpoint({ eventFilterPathPatterns: {} });

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
      expect(instanceStub).not.to.have.been.called;
    });

    it("should fall back to the function region if the instance has no location", async () => {
      instanceStub.resolves({ location: "-" });
      const ep = namedInstanceEndpoint();

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
    });

    it("should fall back to the function region without a warning if the instance lookup fails", async () => {
      instanceStub.rejects(new Error("permission denied"));
      const ep = namedInstanceEndpoint();

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("us-central1");
      expect(warnStub).not.to.have.been.called;
      expect(debugStub).to.have.been.calledOnce;
      expect(debugStub.firstCall.args[0]).to.include("my-instance");
      expect(debugStub.firstCall.args[0]).to.include("will use the function region us-central1");
    });

    it("should keep a trigger region that differs from the function region", async () => {
      const ep = namedInstanceEndpoint();
      ep.eventTrigger.region = "europe-west1";

      await database.ensureDatabaseTriggerRegion(ep);

      expect(ep.eventTrigger.region).to.eq("europe-west1");
      expect(instanceStub).not.to.have.been.called;
    });

    it("should make one request for several functions on the same instance", async () => {
      instanceStub.resolves({ location: "europe-west1" });
      const eps = [namedInstanceEndpoint(), namedInstanceEndpoint(), namedInstanceEndpoint()];

      await Promise.all(eps.map((ep) => database.ensureDatabaseTriggerRegion(ep)));

      expect(eps.map((ep) => ep.eventTrigger.region)).to.deep.eq([
        "europe-west1",
        "europe-west1",
        "europe-west1",
      ]);
      expect(instanceStub).to.have.been.calledOnce;
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

    it("should share one API call between concurrent lookups of the same instance", async () => {
      instanceStub.resolves({ location: "us-central1" });

      const [d1, d2] = await Promise.all([
        database.getDatabaseInstanceDetails(projectNumber, "instance1"),
        database.getDatabaseInstanceDetails(projectNumber, "instance1"),
      ]);

      expect(d1).to.equal(d2);
      expect(instanceStub).to.have.been.calledOnce;
    });

    it("should share one failure between concurrent lookups and retry on a later call", async () => {
      instanceStub.onFirstCall().rejects(new Error("unavailable"));
      instanceStub.onSecondCall().resolves({ location: "us-central1" });

      const results = await Promise.allSettled([
        database.getDatabaseInstanceDetails(projectNumber, "instance1"),
        database.getDatabaseInstanceDetails(projectNumber, "instance1"),
      ]);
      expect(results.map((r) => r.status)).to.deep.eq(["rejected", "rejected"]);
      expect(instanceStub).to.have.been.calledOnce;

      const details = await database.getDatabaseInstanceDetails(projectNumber, "instance1");

      expect(details.location).to.eq("us-central1");
      expect(instanceStub).to.have.been.calledTwice;
    });

    it("should keep a newer cached lookup when an older one fails after the cache is cleared", async () => {
      let rejectFirst: (err: Error) => void = () => undefined;
      instanceStub.onFirstCall().returns(
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
      );
      instanceStub.onSecondCall().resolves({ location: "europe-west1" });

      const stale = database.getDatabaseInstanceDetails(projectNumber, "instance1");
      database.clearCache();
      await database.getDatabaseInstanceDetails(projectNumber, "instance1");
      rejectFirst(new Error("unavailable"));
      await expect(stale).to.be.rejectedWith("unavailable");

      const details = await database.getDatabaseInstanceDetails(projectNumber, "instance1");

      expect(details.location).to.eq("europe-west1");
      expect(instanceStub).to.have.been.calledTwice;
    });
  });
});
