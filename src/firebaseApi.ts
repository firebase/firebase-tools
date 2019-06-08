import * as api from "./api";

const API_VERSION = "v1beta1";

/**
 * Represents the FirebaseProject resource returned from calling
 * `projects.get` in Firebase Management API:
 * https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/projects#FirebaseProject
 */
export interface FirebaseProject {
  projectId: string;
  projectNumber: number;
  displayName: string;
  name: string;
  resources: {
    hostingSite?: string;
    realtimeDatabaseInstance?: string;
    storageBucket?: string;
    locationId?: string;
  };
}

export async function listProjects(
  nextPageToken?: string,
  projectsList: FirebaseProject[] = []
): Promise<FirebaseProject[]> {
  let path = `/${API_VERSION}/projects?page_size=100`;
  if (nextPageToken) {
    path += `&page_token=${nextPageToken}`;
  }

  const response = await api.request("GET", path, {
    auth: true,
    origin: api.firebaseApiOrigin,
  });
  projectsList = projectsList.concat(response.body.results);
  if (response.body.nextPageToken) {
    return listProjects(response.body.nextPageToken, projectsList);
  }
  return projectsList;
}

export async function getProject(projectId: string): Promise<FirebaseProject> {
  const response = await api.request("GET", `/${API_VERSION}/projects/${projectId}`, {
    auth: true,
    origin: api.firebaseApiOrigin,
  });
  return response.body;
}
