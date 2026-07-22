export interface CloudProjectInfo {
  project: string /* The resource name of the GCP project: "projects/projectId" */;
  displayName?: string;
  locationId?: string;
}

export interface ProjectPage<T> {
  projects: T[];
  nextPageToken?: string;
}

export interface FirebaseProjectMetadata {
  name: string /* The fully qualified resource name of the Firebase project */;
  projectId: string;
  projectNumber: string;
  displayName?: string;
  resources?: DefaultProjectResources;
}

export interface DefaultProjectResources {
  hostingSite?: string;
  realtimeDatabaseInstance?: string;
  storageBucket?: string;
  locationId?: string;
}
