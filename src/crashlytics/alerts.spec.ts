import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import nock from "../test/helpers/nock";

import { cloudMonitoringOrigin, crashlyticsApiOrigin } from "../api";
import { FirebaseError } from "../error";
import {
  addChannelToPolicy,
  createEmailChannel,
  enableAlert,
  enableAlerts,
  fetchFirebaseEmailChannel,
  FIREBASE_CHANNEL_LABEL,
  FIREBASE_EMAIL_CHANNEL_DISPLAY_NAME_SUFFIX,
  generateAlertPolicy,
  NOTIFICATION_CHANNELS_MASK_PATH,
  resolveEmailNotificationChannel,
} from "./alerts";
import { AlertType } from "./types";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("crashlytics alerts", () => {
  const projectId = "test-project";
  const appId = "1:1234567890:web:abcdef1234567890";
  const userEmail = "user@example.com";
  const channelName = `projects/${projectId}/notificationChannels/67890`;
  const newIssuePolicyName = `projects/${projectId}/alertPolicies/11111`;
  const regressedIssuePolicyName = `projects/${projectId}/alertPolicies/22222`;

  const expectedFilter = `type = "email" AND labels.email_address = "${userEmail}" AND user_labels.${FIREBASE_CHANNEL_LABEL} = "true"`;

  const emailChannel = {
    name: channelName,
    type: "email",
    displayName: `${userEmail}${FIREBASE_EMAIL_CHANNEL_DISPLAY_NAME_SUFFIX}`,
    labels: { email_address: userEmail },
    userLabels: { [FIREBASE_CHANNEL_LABEL]: "true" },
  };

  afterEach(() => {
    nock.cleanAll();
  });

  describe("generateAlertPolicy", () => {
    it("should generate an alert policy and return its resource name", async () => {
      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_NEW_ISSUE,
        })
        .reply(200, { alertPolicy: newIssuePolicyName });

      const res = await generateAlertPolicy(projectId, appId, AlertType.ALERT_TYPE_NEW_ISSUE);
      expect(res).to.equal(newIssuePolicyName);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError when API fails", async () => {
      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`)
        .reply(500, { error: "Internal Server Error" });

      await expect(
        generateAlertPolicy(projectId, appId, AlertType.ALERT_TYPE_NEW_ISSUE),
      ).to.be.rejectedWith(
        FirebaseError,
        `Failed to generate Crashlytics alert policy for ${AlertType.ALERT_TYPE_NEW_ISSUE} on app ${appId}`,
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("fetchFirebaseEmailChannel", () => {
    it("should return existing Firebase email channel when found", async () => {
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, { notificationChannels: [emailChannel] });

      const res = await fetchFirebaseEmailChannel(projectId, userEmail);
      expect(res).to.deep.equal(emailChannel);
      expect(nock.isDone()).to.be.true;
    });

    it("should return undefined when no matching channel exists", async () => {
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, {});

      const res = await fetchFirebaseEmailChannel(projectId, userEmail);
      expect(res).to.be.undefined;
      expect(nock.isDone()).to.be.true;
    });

    it("should escape quotes and backslashes in userEmail when building filter", async () => {
      const specialEmail = 'user\\"name@example.com';
      const escapedFilter = `type = "email" AND labels.email_address = "user\\\\\\"name@example.com" AND user_labels.${FIREBASE_CHANNEL_LABEL} = "true"`;
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: escapedFilter })
        .reply(200, { notificationChannels: [emailChannel] });

      const res = await fetchFirebaseEmailChannel(projectId, specialEmail);
      expect(res).to.deep.equal(emailChannel);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("createEmailChannel", () => {
    it("should create a Firebase-labeled email notification channel", async () => {
      nock(cloudMonitoringOrigin())
        .post(`/v3/projects/${projectId}/notificationChannels`, {
          type: "email",
          displayName: `${userEmail}${FIREBASE_EMAIL_CHANNEL_DISPLAY_NAME_SUFFIX}`,
          labels: { email_address: userEmail },
          userLabels: { [FIREBASE_CHANNEL_LABEL]: "true" },
        })
        .reply(200, emailChannel);

      const res = await createEmailChannel(projectId, userEmail);
      expect(res).to.deep.equal(emailChannel);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("resolveEmailNotificationChannel", () => {
    it("should reuse an existing channel if present", async () => {
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, { notificationChannels: [emailChannel] });

      const res = await resolveEmailNotificationChannel(projectId, userEmail);
      expect(res).to.deep.equal(emailChannel);
      expect(nock.isDone()).to.be.true;
    });

    it("should create a new channel if none exists", async () => {
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, {});
      nock(cloudMonitoringOrigin())
        .post(`/v3/projects/${projectId}/notificationChannels`)
        .reply(200, emailChannel);

      const res = await resolveEmailNotificationChannel(projectId, userEmail);
      expect(res).to.deep.equal(emailChannel);
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("addChannelToPolicy", () => {
    it("should append channelName when not already present", () => {
      const policy = { name: newIssuePolicyName, notificationChannels: [] };
      const updated = addChannelToPolicy(policy, channelName);
      expect(updated.notificationChannels).to.deep.equal([channelName]);
      expect(policy.notificationChannels).to.deep.equal([]);
    });

    it("should not duplicate channelName when already present", () => {
      const policy = { name: newIssuePolicyName, notificationChannels: [channelName] };
      const updated = addChannelToPolicy(policy, channelName);
      expect(updated.notificationChannels).to.deep.equal([channelName]);
    });
  });

  describe("enableAlert", () => {
    it("should generate policy, attach channel, and update policy", async () => {
      const initialPolicy = { name: newIssuePolicyName, notificationChannels: [] };
      const updatedPolicy = { name: newIssuePolicyName, notificationChannels: [channelName] };

      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, { notificationChannels: [emailChannel] });
      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_NEW_ISSUE,
        })
        .reply(200, { alertPolicy: newIssuePolicyName });
      nock(cloudMonitoringOrigin()).get(`/v3/${newIssuePolicyName}`).reply(200, initialPolicy);
      nock(cloudMonitoringOrigin())
        .patch(`/v3/${newIssuePolicyName}`, updatedPolicy)
        .query({ updateMask: NOTIFICATION_CHANNELS_MASK_PATH })
        .reply(200, updatedPolicy);

      const res = await enableAlert(projectId, appId, AlertType.ALERT_TYPE_NEW_ISSUE, {
        userEmail,
      });

      expect(res.channel).to.deep.equal(emailChannel);
      expect(res.policy).to.deep.equal(updatedPolicy);
      expect(nock.isDone()).to.be.true;
    });

    it("should skip updating policy if channelName is already attached", async () => {
      const existingPolicy = { name: newIssuePolicyName, notificationChannels: [channelName] };

      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_NEW_ISSUE,
        })
        .reply(200, { alertPolicy: newIssuePolicyName });
      nock(cloudMonitoringOrigin()).get(`/v3/${newIssuePolicyName}`).reply(200, existingPolicy);

      const res = await enableAlert(projectId, appId, AlertType.ALERT_TYPE_NEW_ISSUE, {
        channelName,
      });

      expect(res.policy).to.deep.equal(existingPolicy);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError when neither channelName nor userEmail is specified", async () => {
      await expect(
        enableAlert(projectId, appId, AlertType.ALERT_TYPE_NEW_ISSUE, { userEmail: "" }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Either channelName or userEmail must be specified to enable a Crashlytics alert.",
      );
    });

    it("should throw a FirebaseError when resolved notification channel is missing a name", async () => {
      const namelessChannel = { ...emailChannel, name: undefined };
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, { notificationChannels: [namelessChannel] });

      await expect(
        enableAlert(projectId, appId, AlertType.ALERT_TYPE_NEW_ISSUE, { userEmail }),
      ).to.be.rejectedWith(
        FirebaseError,
        "Resolved notification channel is missing a resource name.",
      );
      expect(nock.isDone()).to.be.true;
    });
  });

  describe("enableAlerts", () => {
    it("should return empty array without API calls when alertTypes is empty", async () => {
      const res = await enableAlerts(projectId, appId, [], userEmail);
      expect(res).to.deep.equal([]);
      expect(nock.isDone()).to.be.true;
    });

    it("should throw a FirebaseError when resolved channel is missing a name", async () => {
      const namelessChannel = { ...emailChannel, name: undefined };
      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, { notificationChannels: [namelessChannel] });

      await expect(
        enableAlerts(projectId, appId, [AlertType.ALERT_TYPE_NEW_ISSUE], userEmail),
      ).to.be.rejectedWith(
        FirebaseError,
        "Notification channel for Crashlytics alerts is missing a name.",
      );
      expect(nock.isDone()).to.be.true;
    });

    it("should resolve channel once and enable both new and regressed issue alerts", async () => {
      const initialNewPolicy = { name: newIssuePolicyName, notificationChannels: [] };
      const updatedNewPolicy = { name: newIssuePolicyName, notificationChannels: [channelName] };
      const initialRegressedPolicy = { name: regressedIssuePolicyName, notificationChannels: [] };
      const updatedRegressedPolicy = {
        name: regressedIssuePolicyName,
        notificationChannels: [channelName],
      };

      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, {});
      nock(cloudMonitoringOrigin())
        .post(`/v3/projects/${projectId}/notificationChannels`)
        .reply(200, emailChannel);

      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_NEW_ISSUE,
        })
        .reply(200, { alertPolicy: newIssuePolicyName });
      nock(cloudMonitoringOrigin()).get(`/v3/${newIssuePolicyName}`).reply(200, initialNewPolicy);
      nock(cloudMonitoringOrigin())
        .patch(`/v3/${newIssuePolicyName}`, updatedNewPolicy)
        .query({ updateMask: NOTIFICATION_CHANNELS_MASK_PATH })
        .reply(200, updatedNewPolicy);

      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_REGRESSED_ISSUE,
        })
        .reply(200, { alertPolicy: regressedIssuePolicyName });
      nock(cloudMonitoringOrigin())
        .get(`/v3/${regressedIssuePolicyName}`)
        .reply(200, initialRegressedPolicy);
      nock(cloudMonitoringOrigin())
        .patch(`/v3/${regressedIssuePolicyName}`, updatedRegressedPolicy)
        .query({ updateMask: NOTIFICATION_CHANNELS_MASK_PATH })
        .reply(200, updatedRegressedPolicy);

      const res = await enableAlerts(
        projectId,
        appId,
        [AlertType.ALERT_TYPE_NEW_ISSUE, AlertType.ALERT_TYPE_REGRESSED_ISSUE],
        userEmail,
      );

      expect(res).to.deep.equal([updatedNewPolicy, updatedRegressedPolicy]);
      expect(nock.isDone()).to.be.true;
    });

    it("should preserve fulfilled policies when one alert type fails", async () => {
      const initialNewPolicy = { name: newIssuePolicyName, notificationChannels: [] };
      const updatedNewPolicy = { name: newIssuePolicyName, notificationChannels: [channelName] };

      nock(cloudMonitoringOrigin())
        .get(`/v3/projects/${projectId}/notificationChannels`)
        .query({ filter: expectedFilter })
        .reply(200, { notificationChannels: [emailChannel] });

      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_NEW_ISSUE,
        })
        .reply(200, { alertPolicy: newIssuePolicyName });
      nock(cloudMonitoringOrigin()).get(`/v3/${newIssuePolicyName}`).reply(200, initialNewPolicy);
      nock(cloudMonitoringOrigin())
        .patch(`/v3/${newIssuePolicyName}`, updatedNewPolicy)
        .query({ updateMask: NOTIFICATION_CHANNELS_MASK_PATH })
        .reply(200, updatedNewPolicy);

      nock(crashlyticsApiOrigin())
        .post(`/v1alpha/projects/${projectId}/apps/${appId}:generateAlertPolicy`, {
          alertType: AlertType.ALERT_TYPE_REGRESSED_ISSUE,
        })
        .reply(500, { error: "Internal Server Error" });

      const res = await enableAlerts(
        projectId,
        appId,
        [AlertType.ALERT_TYPE_NEW_ISSUE, AlertType.ALERT_TYPE_REGRESSED_ISSUE],
        userEmail,
      );

      expect(res).to.deep.equal([updatedNewPolicy]);
      expect(nock.isDone()).to.be.true;
    });
  });
});
