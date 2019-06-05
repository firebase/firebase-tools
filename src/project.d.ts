export interface Project {
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

export interface ProjectInfo {
  id: string;
  label: string;
  instance: string;
  location: string;
}
