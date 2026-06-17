import { expect } from "chai";
import * as sinon from "sinon";

import * as apphosting from "../../gcp/apphosting";
import * as apps from "../../management/apps";
import * as backendHelper from "../backend";
import * as poller from "../../operation-poller";
import { acquireComparisonSlot, releaseComparisonSlot } from "./slots";

describe("Comparison Slots Manager", () => {
  let listBackendsStub: sinon.SinonStub;
  let updateBackendStub: sinon.SinonStub;
  let createBackendStub: sinon.SinonStub;
  let listFirebaseAppsStub: sinon.SinonStub;
  let createWebAppStub: sinon.SinonStub;
  let pollOperationStub: sinon.SinonStub;

  beforeEach(() => {
    listBackendsStub = sinon.stub(apphosting, "listBackends");
    updateBackendStub = sinon.stub(apphosting, "updateBackend");
    createBackendStub = sinon.stub(backendHelper, "createBackend");
    listFirebaseAppsStub = sinon.stub(apps, "listFirebaseApps");
    createWebAppStub = sinon.stub(apps, "createWebApp");
    pollOperationStub = sinon.stub(poller, "pollOperation").resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should acquire an existing idle slot", async () => {
    listBackendsStub.resolves({
      backends: [
        {
          name: "projects/test/locations/us-central1/backends/compare-slot-1-0",
          labels: { status: "idle", type: "comparison-sandbox" },
        },
        {
          name: "projects/test/locations/us-central1/backends/compare-slot-1-1",
          labels: { status: "idle", type: "comparison-sandbox" },
        },
      ],
    });
    listFirebaseAppsStub.resolves([{ appId: "web-app-123", displayName: "existing-app" }]);
    updateBackendStub.resolves({ name: "op-name" });

    const slot = await acquireComparisonSlot("aryanf-test", "us-central1", 2);
    expect(slot.index).to.equal(1);
    expect(slot.backendIds[0]).to.equal("compare-slot-1-0");
    expect(slot.backendIds[1]).to.equal("compare-slot-1-1");

    expect(updateBackendStub.callCount).to.equal(2);
    expect(createBackendStub.callCount).to.equal(0);
  });

  it("should provision a slot if it doesn't exist and project is below limit", async () => {
    listBackendsStub.resolves({ backends: [] });
    listFirebaseAppsStub.resolves([{ appId: "web-app-123", displayName: "existing-app" }]);
    createBackendStub.resolves({ name: "backend-resource" });
    updateBackendStub.resolves({ name: "op-name" });

    const slot = await acquireComparisonSlot("aryanf-test", "us-central1", 2);
    expect(slot.index).to.equal(1);
    expect(createBackendStub.callCount).to.equal(2);
  });

  it("should throw if all slots are locked/busy", async () => {
    const busyBackends = [];
    for (let i = 1; i <= 5; i++) {
      busyBackends.push(
        {
          name: `projects/test/locations/us-central1/backends/compare-slot-${i}-0`,
          labels: { status: "busy", type: "comparison-sandbox" },
        },
        {
          name: `projects/test/locations/us-central1/backends/compare-slot-${i}-1`,
          labels: { status: "busy", type: "comparison-sandbox" },
        },
      );
    }
    listBackendsStub.resolves({ backends: busyBackends });

    await expect(acquireComparisonSlot("aryanf-test", "us-central1", 2)).to.be.rejectedWith(
      "All 5 comparison slots are currently in use or project backend limits exceeded",
    );
  });
});
