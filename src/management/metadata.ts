export interface ProjectMetadata {
  name: string /* The fully qualified resource name of the Firebase project */;
  projectId: string;
  projectNumber: string;
  displayName: string;
  resources: DefaultResource;
}

export interface DefaultResource {
  hostingSite: string;
  realtimeDatabaseInstance: string;
  storageBucket: string;
  locationId: string;
}

export interface AppMetadata {
  name: string /* The fully qualified resource name of the Firebase App*/;
  projectId: string;
  appId: string;
  platform: AppPlatform;
  displayName?: string;
}

export interface IosAppMetadata extends AppMetadata {
  bundleId: string;
  appStoreId?: string;
  platform: AppPlatform.IOS;
}

export interface AndroidAppMetadata extends AppMetadata {
  packageName: string;
  platform: AppPlatform.ANDROID;
}

export interface WebAppMetadata extends AppMetadata {
  displayName: string;
  appUrls?: string[];
  platform: AppPlatform.WEB;
}

export enum AppPlatform {
  PLATFORM_UNSPECIFIED = "PLATFORM UNSPECIFIED",
  IOS = "IOS",
  ANDROID = "ANDROID",
  WEB = "WEB",
}
