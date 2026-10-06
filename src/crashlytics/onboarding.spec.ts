import { expect } from "chai";
import * as sinon from "sinon";
import nock from "../test/helpers/nock";

import * as onboarding from "./onboarding";
import * as alerts from "./alerts";
import * as ensureApiEnabled from "../ensureApiEnabled";
import * as experiments from "../experiments";
import * as cloudlogging from "../gcp/cloudlogging";
import * as cloudbilling from "../gcp/cloudbilling";
import * as firebasetelemetry from "./firebasetelemetry";
import * as apps from "../management/apps";
import * as apikeys from "../gcp/apikeys";
import * as prompt from "../prompt";
import * as requireAuth from "../requireAuth";
import * as cloudtrace from "../gcp/cloudtrace";
import * as utils from "../utils";
import { FirebaseError } from "../error";
import { AlertType } from "./types";

describe("onboarding", () => {
  let ensureStub: sinon.SinonStub;
  let bucketStub: sinon.SinonStub;
  let sinkStub: sinon.SinonStub;
  let provisionTraceStub: sinon.SinonStub;
  let configStub: sinon.SinonStub;
  let checkBillingStub: sinon.SinonStub;
  let getAppConfigStub: sinon.SinonStub;
  let updateAppApiKeyRestrictionStub: sinon.SinonStub;
  let logLabeledWarningStub: sinon.SinonStub;
  let checkboxStub: sinon.SinonStub;
  let enableAlertsStub: sinon.SinonStub;
  let requireAuthStub: sinon.SinonStub;
  let isEnabledStub: sinon.SinonStub;

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
    provisionTraceStub = sinon.stub(cloudtrace, "provisionTraceStorage").resolves();
    configStub = sinon.stub(firebasetelemetry, "createOrUpdateTelemetryConfig").resolves({
      name: "projects/test-project/locations/global/configs/1-123-web-456",
      appId: "1:123:web:456",
      logBucket: "projects/test-project/locations/global/buckets/firebase-telemetry",
      samplingRate: 1,
      enablementState: "ENABLED",
    });
    getAppConfigStub = sinon.stub(apps, "getAppConfig").resolves({
      projectId: "test-project",
      apiKey: "fake-api-key-123",
    });
    updateAppApiKeyRestrictionStub = sinon.stub(apikeys, "updateAppApiKeyRestriction").resolves();
    logLabeledWarningStub = sinon.stub(utils, "logLabeledWarning");
    checkboxStub = sinon
      .stub(prompt, "checkbox")
      .resolves([AlertType.ALERT_TYPE_NEW_ISSUE, AlertType.ALERT_TYPE_REGRESSED_ISSUE]);
    enableAlertsStub = sinon.stub(alerts, "enableAlerts").resolves([
      { name: "projects/test-project/alertPolicies/111", notificationChannels: ["ch-1"] },
      { name: "projects/test-project/alertPolicies/222", notificationChannels: ["ch-1"] },
    ]);
    requireAuthStub = sinon.stub(requireAuth, "requireAuth").resolves("user@example.com");
    isEnabledStub = sinon.stub(experiments, "isEnabled");
    isEnabledStub.withArgs("crashlyticsWebAlerts").returns(true);
    isEnabledStub.withArgs("crashlyticsWebTrace").returns(true);
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it("should successfully onboard web app and enable selected alerts", async () => {
    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      onboarding.CRASHLYTICS_TELEMETRY_SERVICE,
      "crashlytics",
      false,
    );
    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      "firebasetelemetryadmin.googleapis.com",
      "crashlytics",
      false,
    );
    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      "cloudtrace.googleapis.com",
      "crashlytics",
      false,
    );
    expect(bucketStub).to.have.been.calledWith(
      "test-project",
      "firebase-telemetry",
      "global",
      true,
    );
    expect(sinkStub).to.have.been.calledOnce;
    expect(provisionTraceStub).to.have.been.calledWith("test-project");
    expect(configStub).to.have.been.calledWith(
      "test-project",
      "1:123:web:456",
      "projects/test-project/locations/global/buckets/firebase-telemetry",
      1,
    );
    expect(updateAppApiKeyRestrictionStub).to.have.been.calledWith({
      apiKey: "fake-api-key-123",
      service: onboarding.CRASHLYTICS_TELEMETRY_SERVICE,
    });
    expect(checkboxStub).to.have.been.calledOnce;
    expect(enableAlertsStub).to.have.been.calledOnceWith(
      "test-project",
      "1:123:web:456",
      [AlertType.ALERT_TYPE_NEW_ISSUE, AlertType.ALERT_TYPE_REGRESSED_ISSUE],
      "user@example.com",
    );
    expect(res.config.enablementState).to.equal("ENABLED");
    expect(res.alertPolicies).to.have.lengthOf(2);
  });

  it("should use options.user.email directly when present without calling requireAuth", async () => {
    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456", {
      user: { email: "cli-user@example.com" },
    });

    expect(requireAuthStub).to.not.have.been.called;
    expect(enableAlertsStub).to.have.been.calledOnceWith(
      "test-project",
      "1:123:web:456",
      [AlertType.ALERT_TYPE_NEW_ISSUE, AlertType.ALERT_TYPE_REGRESSED_ISSUE],
      "cli-user@example.com",
    );
    expect(res.alertPolicies).to.have.lengthOf(2);
  });

  it("should skip enabling alerts if user deselects all alert options", async () => {
    checkboxStub.resolves([]);

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(checkboxStub).to.have.been.calledOnce;
    expect(enableAlertsStub).to.not.have.been.called;
    expect(res.alertPolicies).to.be.undefined;
  });

  it("should skip alerting prompt and setup when crashlyticsWebAlerts experiment is disabled", async () => {
    isEnabledStub.withArgs("crashlyticsWebAlerts").returns(false);

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(checkboxStub).to.not.have.been.called;
    expect(enableAlertsStub).to.not.have.been.called;
    expect(res.alertPolicies).to.be.undefined;
  });

  it("should skip only the Cloud Trace API enablement and storage provisioning when crashlyticsWebTrace experiment is disabled", async () => {
    isEnabledStub.withArgs("crashlyticsWebTrace").returns(false);

    await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      onboarding.CRASHLYTICS_TELEMETRY_SERVICE,
      "crashlytics",
      false,
    );
    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      "firebasetelemetryadmin.googleapis.com",
      "crashlytics",
      false,
    );
    expect(ensureStub).to.not.have.been.calledWith(
      "test-project",
      "cloudtrace.googleapis.com",
      "crashlytics",
      false,
    );
    expect(provisionTraceStub).to.not.have.been.called;
  });

  it("should skip alerting prompt and setup in non-interactive mode", async () => {
    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456", {
      nonInteractive: true,
    });

    expect(checkboxStub).to.not.have.been.called;
    expect(enableAlertsStub).to.not.have.been.called;
    expect(res.alertPolicies).to.be.undefined;
  });

  it("should log a warning and skip prompt if authenticated user email cannot be determined for alerts", async () => {
    requireAuthStub.resolves(null);

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(checkboxStub).to.not.have.been.called;
    expect(enableAlertsStub).to.not.have.been.called;
    expect(logLabeledWarningStub).to.have.been.calledWith(
      "crashlytics",
      "Unable to determine authenticated user email for alert setup. You can configure alerts later in the Firebase Console.",
    );
    expect(res.config.enablementState).to.equal("ENABLED");
  });

  it("should log a warning and skip prompt if requireAuth throws an error", async () => {
    requireAuthStub.rejects(new FirebaseError("Auth failed"));

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(checkboxStub).to.not.have.been.called;
    expect(enableAlertsStub).to.not.have.been.called;
    expect(logLabeledWarningStub).to.have.been.calledWith(
      "crashlytics",
      "Unable to determine authenticated user email for alert setup. You can configure alerts later in the Firebase Console.",
    );
    expect(res.config.enablementState).to.equal("ENABLED");
  });

  it("should log a warning and still succeed if enableAlerts throws an error", async () => {
    const alertError = new FirebaseError("Failed to generate alert policy");
    enableAlertsStub.rejects(alertError);

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(enableAlertsStub).to.have.been.calledOnce;
    expect(logLabeledWarningStub).to.have.been.calledWith("crashlytics", alertError.message);
    expect(res.config.enablementState).to.equal("ENABLED");
  });

  it("should successfully onboard web app and log a warning without calling updateAppApiKeyRestriction if apiKey is missing", async () => {
    getAppConfigStub.resolves({
      projectId: "test-project",
    });

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      onboarding.CRASHLYTICS_TELEMETRY_SERVICE,
      "crashlytics",
      false,
    );
    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      "firebasetelemetryadmin.googleapis.com",
      "crashlytics",
      false,
    );
    expect(ensureStub).to.have.been.calledWith(
      "test-project",
      "cloudtrace.googleapis.com",
      "crashlytics",
      false,
    );
    expect(bucketStub).to.have.been.calledWith(
      "test-project",
      "firebase-telemetry",
      "global",
      true,
    );
    expect(sinkStub).to.have.been.calledOnce;
    expect(provisionTraceStub).to.have.been.calledWith("test-project");
    expect(configStub).to.have.been.calledWith(
      "test-project",
      "1:123:web:456",
      "projects/test-project/locations/global/buckets/firebase-telemetry",
      1,
    );
    expect(updateAppApiKeyRestrictionStub).to.not.have.been.called;
    expect(logLabeledWarningStub).to.have.been.calledWith(
      "crashlytics",
      `No API key found for this app. If you configure an API key later, ` +
        `please rerun this command or manually add '${onboarding.CRASHLYTICS_TELEMETRY_SERVICE}' to its allowed APIs in the Google Cloud Console if the key is restricted.`,
    );
    expect(res.config.enablementState).to.equal("ENABLED");
  });

  it("should successfully onboard web app and log a warning if updateAppApiKeyRestriction throws an error", async () => {
    const fakeError = new FirebaseError("Failed to update API key restriction");
    updateAppApiKeyRestrictionStub.rejects(fakeError);

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(updateAppApiKeyRestrictionStub).to.have.been.calledOnce;
    expect(logLabeledWarningStub).to.have.been.calledWith("crashlytics", fakeError.message);
    expect(res.config.enablementState).to.equal("ENABLED");
  });

  it("should successfully onboard web app and log a warning if provisionTraceStorage throws an error", async () => {
    const fakeError = new FirebaseError(
      "Failed to provision trace storage for project test-project",
    );
    provisionTraceStub.rejects(fakeError);

    const res = await onboarding.onboardCrashlyticsWeb("test-project", "1:123:web:456");

    expect(provisionTraceStub).to.have.been.calledOnce;
    expect(logLabeledWarningStub).to.have.been.calledWith("crashlytics", fakeError.message);
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
