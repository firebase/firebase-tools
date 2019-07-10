export interface FirebaseProjectMetadata {
  name: string /* The fully qualified resource name of the Firebase project */;
  projectId: string;
  projectNumber: string;
  displayName: string;
  resources: DefaultProjectResources;
}

export interface DefaultProjectResources {
  hostingSite: string;
  realtimeDatabaseInstance: string;
  storageBucket: string;
  locationId: string;
}

// TODO(caot): Add API methods related to project management into this file
