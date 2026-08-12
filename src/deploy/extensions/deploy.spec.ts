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
  const instance = (instanceId: string) => ({ instanceId, params: {}, systemParams: {} }) as any;

  beforeEach(() => {
    checkBillingEnabledStub = sinon.stub(cloudbilling, "checkBillingEnabled").resolves(true);
    bulkCheckProductsProvisionedStub = sinon
      .stub(provisioningHelper, "bulkCheckProductsProvisioned")
      .resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should do nothing when there is nothing to deploy", async () => {
    // A functions deploy for a codebase that declares no extensions reaches this
    // stage with an empty payload, and must not require the Cloud Billing API.
    await deploy({} as Context, options, {} as Payload);

    expect(checkBillingEnabledStub.called).to.be.false;
    expect(bulkCheckProductsProvisionedStub.called).to.be.false;
  });

  it("should do nothing when the payload only has empty instance lists", async () => {
    const payload: Payload = {
      instancesToCreate: [],
      instancesToUpdate: [],
      instancesToConfigure: [],
      instancesToDelete: [],
    };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.called).to.be.false;
    expect(bulkCheckProductsProvisionedStub.called).to.be.false;
  });

  it("should deploy normally when there is an instance to create", async () => {
    const payload: Payload = { instancesToCreate: [instance("new-instance")] };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.calledWith("test-project")).to.be.true;
    // Asserted so that widening the empty-payload guard above cannot silently turn
    // a real deploy into a no-op.
    expect(bulkCheckProductsProvisionedStub.called).to.be.true;
  });

  it("should not skip a delete-only deploy", async () => {
    const payload: Payload = { instancesToDelete: [instance("doomed")] };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.called).to.be.true;
    expect(bulkCheckProductsProvisionedStub.called).to.be.true;
  });

  it("should deploy normally when only configuring an instance", async () => {
    const payload: Payload = { instancesToConfigure: [instance("existing")] };

    await deploy({} as Context, options, payload);

    expect(checkBillingEnabledStub.called).to.be.true;
    expect(bulkCheckProductsProvisionedStub.called).to.be.true;
  });
});
