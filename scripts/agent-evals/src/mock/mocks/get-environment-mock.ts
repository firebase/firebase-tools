import { DEFAULT_FIREBASE_PROJECT, DEFAULT_FIREBASE_USER } from "../../data/index.js";
import { renderTemplate } from "../../../../../src/mcp/tools/core/get_environment.js";
import { toMockContent } from "../tool-mock-utils.js";

const PROJECT_DIR = "/Users/fakeuser/develop/fake-project";
const IOS_APP_ID = `1:${DEFAULT_FIREBASE_PROJECT}:ios:abc123efj456`;
const IOS_BUNDLE_ID = "com.firebase.fake.ios";
const ANDROID_APP_ID = `1:${DEFAULT_FIREBASE_PROJECT}:android:abc123efj456`;
const ANDROID_PACKAGE_NAME = "com.firebase.fake.android";

const BASE_ENVIRONMENT_CONFIG = {
  projectId: DEFAULT_FIREBASE_PROJECT,
  projectAliases: [],
  projectDir: PROJECT_DIR,
  geminiTosAccepted: true,
  authenticatedUser: DEFAULT_FIREBASE_USER,
  projectAliasMap: {},
  allAccounts: [],
  detectedAppIds: {},
};

export const getEnvironmentWithIosApp = {
  firebase_get_environment: toMockContent(
    renderTemplate({ ...BASE_ENVIRONMENT_CONFIG, detectedAppIds: { [IOS_APP_ID]: IOS_BUNDLE_ID } }),
  ),
};

export const getEnvironmentWithAndroidApp = {
  firebase_get_environment: toMockContent(
    renderTemplate({
      ...BASE_ENVIRONMENT_CONFIG,
      detectedAppIds: { [ANDROID_APP_ID]: ANDROID_PACKAGE_NAME },
    }),
  ),
};

export const getEnvironmentWithFlutterApp = {
  firebase_get_environment: toMockContent(
    renderTemplate({
      ...BASE_ENVIRONMENT_CONFIG,
      detectedAppIds: {
        [ANDROID_APP_ID]: ANDROID_PACKAGE_NAME,
        [IOS_APP_ID]: IOS_BUNDLE_ID
      },
    }),
  ),
};
