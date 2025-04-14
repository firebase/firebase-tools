/**
 * Helper interface for an app that is provisioned with App Distribution
 */
export interface AabInfo {
  name: string;
  integrationState: IntegrationState;
  testCertificate: TestCertificate | null;
}

export interface TestCertificate {
  hashSha1: string;
  hashSha256: string;
  hashMd5: string;
}

/** Enum representing the App Bundles state for the App */
export enum IntegrationState {
  AAB_INTEGRATION_STATE_UNSPECIFIED = "AAB_INTEGRATION_STATE_UNSPECIFIED",
  INTEGRATED = "INTEGRATED",
  PLAY_ACCOUNT_NOT_LINKED = "PLAY_ACCOUNT_NOT_LINKED",
  NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT = "NO_APP_WITH_GIVEN_BUNDLE_ID_IN_PLAY_ACCOUNT",
  APP_NOT_PUBLISHED = "APP_NOT_PUBLISHED",
  AAB_STATE_UNAVAILABLE = "AAB_STATE_UNAVAILABLE",
  PLAY_IAS_TERMS_NOT_ACCEPTED = "PLAY_IAS_TERMS_NOT_ACCEPTED",
}

export enum UploadReleaseResult {
  UPLOAD_RELEASE_RESULT_UNSPECIFIED = "UPLOAD_RELEASE_RESULT_UNSPECIFIED",
  RELEASE_CREATED = "RELEASE_CREATED",
  RELEASE_UPDATED = "RELEASE_UPDATED",
  RELEASE_UNMODIFIED = "RELEASE_UNMODIFIED",
}

export interface Release {
  name: string;
  releaseNotes: ReleaseNotes;
  displayVersion: string;
  buildVersion: string;
  createTime: Date;
  firebaseConsoleUri: string;
  testingUri: string;
  binaryDownloadUri: string;
}

export interface ReleaseNotes {
  text: string;
}

export interface UploadReleaseResponse {
  result: UploadReleaseResult;
  release: Release;
}

export interface BatchRemoveTestersResponse {
  emails: string[];
}

export interface ListGroupsResponse {
  groups: Group[];
  nextPageToken?: string;
}

export interface Group {
  name: string;
  displayName: string;
  testerCount?: number;
  releaseCount?: number;
  inviteLinkCount?: number;
}

export interface ListTestersResponse {
  testers: Tester[];
  nextPageToken?: string;
}

export interface Tester {
  name: string;
  displayName?: string;
  groups?: string[];
  lastActivityTime: Date;
}

export interface CreateReleaseTestRequest {
  releaseTest: ReleaseTest;
}

export interface TestDevice {
  model: string;
  version: string;
  locale: string;
  orientation: string;
}

export type TestState = "IN_PROGRESS" | "PASSED" | "FAILED" | "INCONCLUSIVE";

export interface DeviceExecution {
  device: TestDevice;
  state?: TestState;
  failedReason?: string;
  inconclusiveReason?: string;
}

export function mapDeviceToExecution(device: TestDevice): DeviceExecution {
  return {
    device: {
      model: device.model,
      version: device.version,
      orientation: device.orientation,
      locale: device.locale,
    },
  };
}

export interface FieldHints {
  usernameResourceName?: string;
  passwordResourceName?: string;
}

export interface LoginCredential {
  username?: string;
  password?: string;
  fieldHints?: FieldHints;
}

export interface ReleaseTest {
  name?: string;
  deviceExecutions: DeviceExecution[];
  loginCredential?: LoginCredential;
  testCase?: string;
}
