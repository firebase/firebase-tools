import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import * as onboarding from "./onboarding";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as cloudlogging from "../gcp/cloudlogging";
import * as cloudbilling from "../gcp/cloudbilling";
import * as firebasetelemetry from "./firebasetelemetry";
import { FirebaseError } from "../error";

describe("onboarding", () => {
  let ensureStub: sinon.SinonStub;
  let bucketStub: sinon.SinonStub;
  let sinkStub: sinon.SinonStub;
  let configStub: sinon.SinonStub;
  let checkBillingStub: sinon.SinonStub;

  before(() => {
    nock.disableNetConnect();
  });

  after(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    checkBillingStub = sinon.stub(cloudbilling, "checkBillingEnabled").resolves(true);
    ensureStub = sinon.stub(ensureApiEnabled, "ensure").resolves();
    bucketStub = sinon.stub(cloudlogging, "createOrUpdateLogBucket").resolves({
      name: "projects/test-project/locations/global/buckets/firebase-telemetry",
      analyticsEnabled: true,
    });
    sinkStub = sinon.stub(cloudlogging, "createOrUpdateLogSink").resolves({
      name: "firebase-telemetry-routing",
      destination: "dest",
      filter: "filter",
    });
    configStub = sinon.stub(firebasetelemetry, "createOrUpdateTelemetryConfig").resolves({
      name: "projects/test-project/locations/global/configs/1-123-web-456",
      appId: "1:123:web:456",
      logBucket: "projects/test-project/locations/global/buckets/firebase-telemetry",
      samplingRate: 1,
      enablementState: "ENABLED",
    });
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it("should successfully onboard web app", async () => {
    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(ensureStub).to.have.been.calledTwice;
    expect(bucketStub).to.have.been.calledWith(
      "test-project",
      "firebase-telemetry",
      "global",
      true,
    );
    expect(sinkStub).to.have.been.calledOnce;
    expect(configStub).to.have.been.calledWith(
      "test-project",
      "1:123:web:456",
      "projects/test-project/locations/global/buckets/firebase-telemetry",
      1,
    );
    expect(res.config.enablementState).to.equal("ENABLED");
  });

  it("should throw in non-interactive mode if billing is not enabled", async () => {
    checkBillingStub.resolves(false);

    await expect(
      onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456", { nonInteractive: true }),
    ).to.be.rejectedWith(
      FirebaseError,
      "Crashlytics requires the Blaze plan, but project test-project is not on the Blaze plan.",
    );
  });

  it("should call enableBilling if billing is not enabled in interactive mode", async () => {
    checkBillingStub.resolves(false);
    const enableBillingStub = sinon.stub(cloudbilling, "enableBilling").resolves();

    await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(enableBillingStub).to.have.been.calledOnceWith("test-project", "Crashlytics");
  });
});
