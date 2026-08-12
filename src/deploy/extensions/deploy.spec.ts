import { expect } from "chai";
import * as sinon from "sinon";

import { deploy } from "./deploy";
import { Context, Payload } from "./args";
import * as cloudbilling from "../../gcp/cloudbilling";
import * as provisioningHelper from "../../extensions/provisioningHelper";

describe("Extensions deploy", () => {
  let checkBillingEnabledStub: sinon.SinonStub;
  let bulkCheckProductsProvisionedStub: sinon.SinonStub;

  const options: any = { nonInteractive: true, project: "test-project" };

  beforeEach(() => {
    checkBillingEnabledStub = sinon.stub(cloudbilling, "checkBillingEnabled").resolves(true);
    bulkCheckProductsProvisionedStub = sinon
      .stub(provisioningHelper, "bulkCheckProductsProvisioned")
      .resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should not check billing when there is nothing to deploy", async () => {
    // A functions deploy for a codebase that declares no extensions reaches this
    // stage with an empty payload, and must not require the Cloud Billing API.
    await deploy({} as Context, options, {} as Payload);

    expect(checkBillingEnabledStub.called).to.be.false;
    expect(bulkCheckProductsProvisionedStub.called).to.be.false;
  });

  it("should not check billing when the payload only has empty instance lists", async () => {
    const payload: Payload = {
      instancesToCreate: [],
      instancesToUpdate: [],
      instancesToConfigure: [],
      instancesToDelete: [],
    };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.called).to.be.false;
  });

  it("should not check billing for a delete-only deploy", async () => {
    // Deleting an instance does not require the Blaze plan.
    const payload: Payload = {
      instancesToDelete: [{ instanceId: "doomed", params: {}, systemParams: {} } as any],
    };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.called).to.be.false;
  });

  it("should check billing when there is an instance to create", async () => {
    const payload: Payload = {
      instancesToCreate: [{ instanceId: "new-instance", params: {}, systemParams: {} } as any],
    };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.calledWith("test-project")).to.be.true;
  });
});
