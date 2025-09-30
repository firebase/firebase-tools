import { AppPlatform } from "../apps";

interface BaseProvisionAppOptions {
  platform: AppPlatform;
  appId?: string;
}

interface IosAppOptions extends BaseProvisionAppOptions {
  platform: AppPlatform.IOS;
  bundleId?: string;
  appStoreId?: string;
  teamId?: string;
}

interface AndroidAppOptions extends BaseProvisionAppOptions {
  platform: AppPlatform.ANDROID;
  packageName?: string;
  sha1Hashes?: string[];
  sha256Hashes?: string[];
}

interface WebAppOptions extends BaseProvisionAppOptions {
  platform: AppPlatform.WEB;
  webAppId?: string;
}

export type ProvisionAppOptions = IosAppOptions | AndroidAppOptions | WebAppOptions;

export interface ProvisionFirebaseAppResponse {
  configMimeType: string;
  configData: string;
  appResource: string;
}

interface ExistingProjectInput {
  type: "existing_project";
  projectId: string;
}

interface OrganizationInput {
  type: "organization";
  organizationId: string;
}

interface FolderInput {
  type: "folder";
  folderId: string;
}

export type ProjectParentInput = ExistingProjectInput | OrganizationInput | FolderInput;

export interface ProvisionProjectOptions {
  displayName?: string;
  parent?: ProjectParentInput;
  // TODO(caot): Support specifying projectLabels and billing.
  // projectLabels?: Record<string, string>;
  // cloudBillingAccountId?: string;
}

export interface ProvisionFeatureOptions {
  location?: string;
  firebaseAiLogicInput?: Record<string, unknown>;
}

export interface ProvisionFirebaseAppOptions {
  project: ProvisionProjectOptions;
  app: ProvisionAppOptions;
  features?: ProvisionFeatureOptions;
  requestId?: string;
}

export interface ProvisionRequest {
  parent?: string;
  displayName?: string;
  appNamespace: string;
  location?: string;
  requestId?: string;
  appleInput?: {
    appStoreId?: string;
    teamId?: string;
  };
  androidInput?: {
    sha1Hashes?: string[];
    sha256Hashes?: string[];
  };
  webInput?: {};
  firebaseAiLogicInput?: {};
}
