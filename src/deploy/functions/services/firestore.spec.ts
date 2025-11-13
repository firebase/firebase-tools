import { expect } from "chai";
import * as sinon from "sinon";
import { ensureFirestoreTriggerRegion, clearCache } from "./firestore";
import * as firestore from "../../../gcp/firestore";

const projectNumber = "123456789";

const databaseResp = {
  name: "projects/123456789/databases/(default)",
  uid: "f1483bb9-dec9-422f-b786-906e32627426",
  createTime: "2021-06-29T13:40:07.183Z",
  updateTime: "2022-02-06T09:21:27.239176Z",
  locationId: "nam5",
  type: "FIRESTORE_NATIVE",
  concurrencyMode: "PESSIMISTIC",
  appEngineIntegrationMode: "ENABLED",
  keyPrefix: "s",
  deleteProtectionState: "DELETE_PROTECTION_DISABLED",
  etag: "IJbigIfZ2/0CMI75lMHa2f0C",
};

describe("ensureFirestoreTriggerRegion", () => {
  let firestoreStub: sinon.SinonStub;

  beforeEach(() => {
    clearCache();
    firestoreStub = sinon
      .stub(firestore, "getDatabase")
      .throws("unexpected call to firestore.getDatabase");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should throw an error if the trigger region is different than the firestore region", async () => {
    firestoreStub.resolves(databaseResp);
    const ep: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "(default)" },
        region: "us-east1",
      },
    };

    await expect(ensureFirestoreTriggerRegion(ep)).to.be.rejectedWith(
      "A firestore trigger location must match the firestore database region.",
    );
  });

  it("should not throw if the trigger region is not set", async () => {
    firestoreStub.resolves(databaseResp);
    const ep: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "(default)" },
      },
    };

    await ensureFirestoreTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("nam5");
  });

  it("should not throw if the trigger region is set correctly", async () => {
    firestoreStub.resolves(databaseResp);
    const ep: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "(default)" },
        region: "nam5",
      },
    };

    await ensureFirestoreTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("nam5");
  });

  it("should cache database lookups to prevent multiple API calls", async () => {
    firestoreStub.resolves(databaseResp);
    const ep1: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "(default)" },
      },
    };
    const ep2: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "(default)" },
      },
    };

    await Promise.all([ensureFirestoreTriggerRegion(ep1), ensureFirestoreTriggerRegion(ep2)]);

    expect(firestoreStub).to.have.been.calledOnce;
    expect(ep1.eventTrigger.region).to.eq("nam5");
    expect(ep2.eventTrigger.region).to.eq("nam5");
  });

  it("should make separate API calls for different databases", async () => {
    firestoreStub.onFirstCall().resolves(databaseResp);
    firestoreStub
      .onSecondCall()
      .resolves({ ...databaseResp, name: "projects/123456789/databases/db2" });

    const ep1: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "(default)" },
      },
    };
    const ep2: any = {
      project: projectNumber,
      eventTrigger: {
        eventFilters: { database: "db2" },
      },
    };

    await Promise.all([ensureFirestoreTriggerRegion(ep1), ensureFirestoreTriggerRegion(ep2)]);

    expect(firestoreStub).to.have.been.calledTwice;
  });
});
