// Represents the FirebaseProject resource returned from calling `projects.get` in Firebase Management API:
// https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects#FirebaseProject
export interface FirebaseProject {
  projectId: string;
  projectNumber: number;
  displayName: string;
  name: string;
  resources: {
    hostingSite: string;
    realtimeDatabaseInstance: string;
    storageBucket: string;
    locationId: string;
  };
}

// Used in init flows to keep information about the project - basically
// a shorter version of FirebaseProject with some additional fields
export interface ProjectInfo {
  id: string; // maps to projectId
  label: string;
  instance: string; // maps to FirebaseProject.resources.realtimeDatabaseInstance
  location: string; // maps to FirebaseProject.resources.locationId
}
