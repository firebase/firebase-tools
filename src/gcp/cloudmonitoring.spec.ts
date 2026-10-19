import { expect } from "chai";
import nock from "../test/helpers/nock";
import * as api from "../api";
import { FirebaseError } from "../error";
import {
  AlertPolicy,
  Aligner,
  CmQuery,
  createNotificationChannel,
  getAlertPolicy,
  listNotificationChannels,
  NotificationChannel,
  queryTimeSeries,
  TimeSeriesView,
  updateAlertPolicy,
} from "./cloudmonitoring";

const CLOUD_MONITORING_VERSION = "v3";
const PROJECT_NUMBER = 1;
const PROJECT_ID = "test-project";

describe("queryTimeSeries", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const query: CmQuery = {
    filter:
      'metric.type="firebaseextensions.googleapis.com/extension/version/active_instances" resource.type="firebaseextensions.googleapis.com/ExtensionVersion"',
    "interval.endTime": new Date().toJSON(),
    "interval.startTime": new Date().toJSON(),
    view: TimeSeriesView.FULL,
    "aggregation.alignmentPeriod": (60 * 60 * 24).toString() + "s",
    "aggregation.perSeriesAligner": Aligner.ALIGN_MAX,
  };

  const RESPONSE = {
    timeSeries: [],
  };

  it("should make a POST call to the correct endpoint", async () => {
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_NUMBER}/timeSeries/`)
      .query(true)
      .reply(200, RESPONSE);

    const res = await queryTimeSeries(query, PROJECT_NUMBER);
    expect(res).to.deep.equal(RESPONSE.timeSeries);
    expect(nock.isDone()).to.be.true;
  });

  it("should throw a FirebaseError if the endpoint returns an error response", async () => {
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_NUMBER}/timeSeries/`)
      .query(true)
      .reply(404);
    await expect(queryTimeSeries(query, PROJECT_NUMBER)).to.be.rejectedWith(FirebaseError);
    expect(nock.isDone()).to.be.true;
  });
});

describe("notificationChannels", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const channel: NotificationChannel = {
    name: `projects/${PROJECT_ID}/notificationChannels/12345`,
    type: "email",
    displayName: "user@example.com - for Firebase alerts",
    labels: { email_address: "user@example.com" },
    userLabels: { is_firebase_channel: "true" },
  };

  it("listNotificationChannels should return channels matching filter", async () => {
    const filter =
      'type = "email" AND labels.email_address = "user@example.com" AND user_labels.is_firebase_channel = "true"';
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_ID}/notificationChannels`)
      .query({ filter })
      .reply(200, { notificationChannels: [channel] });

    const res = await listNotificationChannels(PROJECT_ID, filter);
    expect(res).to.deep.equal([channel]);
    expect(nock.isDone()).to.be.true;
  });

  it("listNotificationChannels should return empty array when no channels exist", async () => {
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_ID}/notificationChannels`)
      .reply(200, {});

    const res = await listNotificationChannels(PROJECT_ID);
    expect(res).to.deep.equal([]);
    expect(nock.isDone()).to.be.true;
  });

  it("createNotificationChannel should create and return a channel", async () => {
    const input = {
      type: "email",
      displayName: "user@example.com - for Firebase alerts",
      labels: { email_address: "user@example.com" },
      userLabels: { is_firebase_channel: "true" },
    };
    nock(api.cloudMonitoringOrigin())
      .post(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_ID}/notificationChannels`, input)
      .reply(200, channel);

    const res = await createNotificationChannel(PROJECT_ID, input);
    expect(res).to.deep.equal(channel);
    expect(nock.isDone()).to.be.true;
  });

  it("listNotificationChannels should throw a FirebaseError on API error", async () => {
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_ID}/notificationChannels`)
      .reply(500, { error: "Internal Server Error" });

    await expect(listNotificationChannels(PROJECT_ID)).to.be.rejectedWith(
      FirebaseError,
      "Failed to list Cloud Monitoring notification channels",
    );
    expect(nock.isDone()).to.be.true;
  });

  it("createNotificationChannel should throw a FirebaseError on API error", async () => {
    nock(api.cloudMonitoringOrigin())
      .post(`/${CLOUD_MONITORING_VERSION}/projects/${PROJECT_ID}/notificationChannels`)
      .reply(500, { error: "Internal Server Error" });

    await expect(createNotificationChannel(PROJECT_ID, { type: "email" })).to.be.rejectedWith(
      FirebaseError,
      "Failed to create Cloud Monitoring notification channel",
    );
    expect(nock.isDone()).to.be.true;
  });
});

describe("alertPolicies", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  const policyName = `projects/${PROJECT_ID}/alertPolicies/67890`;
  const policy: AlertPolicy = {
    name: policyName,
    displayName: "New Crashlytics issue",
    notificationChannels: [],
  };

  it("getAlertPolicy should retrieve an alert policy by resource name", async () => {
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/${policyName}`)
      .reply(200, policy);

    const res = await getAlertPolicy(policyName);
    expect(res).to.deep.equal(policy);
    expect(nock.isDone()).to.be.true;
  });

  it("getAlertPolicy should throw a FirebaseError on API error", async () => {
    nock(api.cloudMonitoringOrigin())
      .get(`/${CLOUD_MONITORING_VERSION}/${policyName}`)
      .reply(404, { error: "Not Found" });

    await expect(getAlertPolicy(policyName)).to.be.rejectedWith(
      FirebaseError,
      `Failed to get Cloud Monitoring alert policy ${policyName}`,
    );
    expect(nock.isDone()).to.be.true;
  });

  it("updateAlertPolicy should patch an alert policy with updateMask", async () => {
    const updatedPolicy = {
      name: policyName,
      displayName: "New Crashlytics issue",
      notificationChannels: [`projects/${PROJECT_ID}/notificationChannels/12345`],
    };
    nock(api.cloudMonitoringOrigin())
      .patch(`/${CLOUD_MONITORING_VERSION}/${policyName}`, updatedPolicy)
      .query({ updateMask: "notification_channels" })
      .reply(200, updatedPolicy);

    const res = await updateAlertPolicy(updatedPolicy, "notification_channels");
    expect(res).to.deep.equal(updatedPolicy);
    expect(nock.isDone()).to.be.true;
  });

  it("updateAlertPolicy should throw a FirebaseError on API error", async () => {
    nock(api.cloudMonitoringOrigin())
      .patch(`/${CLOUD_MONITORING_VERSION}/${policyName}`)
      .query({ updateMask: "notification_channels" })
      .reply(500, { error: "Internal Server Error" });

    await expect(updateAlertPolicy(policy, "notification_channels")).to.be.rejectedWith(
      FirebaseError,
      `Failed to update Cloud Monitoring alert policy ${policyName}`,
    );
    expect(nock.isDone()).to.be.true;
  });
});
