import * as v1 from "firebase-functions";
import * as v2 from "firebase-functions/v2";
import { v1Opts, v2Opts, v1ScheduleOpts, v2ScheduleOpts, v1TqOpts, v2TqOpts } from "./options.js";

// v1 functions
const withOptions = v1.runWith(v1Opts);
export const v1db = withOptions.database.ref("/foo/bar").onWrite(() => {});
export const v1fire = withOptions.firestore.document("foo/bar").onWrite(() => {});
export const v1auth = withOptions.auth.user().onCreate(() => {});
export const v1pubsub = withOptions.pubsub.topic("foo").onPublish(() => {});
export const v1scheduled = withOptions.pubsub
  .schedule("every 30 minutes")
  .retryConfig(v1ScheduleOpts)
  .onRun(() => {});
export const v1an = withOptions.analytics.event("in_app_purchase").onLog(() => {});
export const v1rc = withOptions.remoteConfig.onUpdate(() => {});
export const v1storage = withOptions.storage.object().onFinalize(() => {});
export const v1testlab = withOptions.testLab.testMatrix().onComplete(() => {});
export const v1tq = withOptions.tasks.taskQueue(v1TqOpts).onDispatch(() => {});
// TODO: Deploying IdP fns fail because we can't make public functions in google.com GCP projects.
// export const v1idp = withOptions.auth.user(v1IdpOpts).beforeCreate(() => {});
// TODO: Deploying https fn fails because we can't make public functions in google.com GCP projecs.
// export const v1req = withOptions.https.onRequest(() => {});
// export const v1callable = withOptions.https.onCall(() => {});
export const v1secret = v1
  .runWith({ ...v1Opts, secrets: ["TOP"] })
  .pubsub.topic("foo")
  .onPublish(() => {});

// v2 functions
v2.setGlobalOptions(v2Opts);
export const v2storage = v2.storage.onObjectFinalized(() => {});
export const v2pubsub = v2.pubsub.onMessagePublished("foo", () => {});
export const v2alerts = v2.alerts.billing.onPlanAutomatedUpdatePublished({}, () => {});
export const v2tq = v2.tasks.onTaskDispatched(v2TqOpts, () => {});
// TODO: Deploying IdP fns fail because we can't make public functions in google.com GCP projects.
// export const v2idp = v2.identity.beforeUserSignedIn(v2IdpOpts, () => {});
// TODO: Deploying https fn fails because we can't make public functions in google.com GCP projecs.
// export const v2req = v2.https.onRequest(() => {});
// export const v2call = v2.https.onCall(() => {});
// TODO: Need a way to create default firebase custom channel as part of integration test.
// export const v2custom = v2.eventarc.onCustomEventPublished("custom.event", () => {});
export const v2secret = v2.pubsub.onMessagePublished({ topic: "foo", secrets: ["TOP"] }, () => {});
export const v2scheduled = v2.scheduler.onSchedule(v2ScheduleOpts, () => {});
export const v2testlab = v2.testLab.onTestMatrixCompleted(() => {});
export const v2rc = v2.remoteConfig.onConfigUpdated(() => {});
export const v2perf = v2.alerts.performance.onThresholdAlertPublished(() => {});
