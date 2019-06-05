import * as api from "./api";
import { FirebaseProject } from "./project";

const API_VERSION = "v1beta1";

export async function listProjects(
  nextPageToken?: string,
  projectsList?: FirebaseProject[]
): Promise<FirebaseProject[]> {
  let projects = projectsList || [];

  let path = `/${API_VERSION}/projects?page_size=100`;
  if (nextPageToken) {
    path += `&page_token=${nextPageToken}`;
  }

  const response = await api.request("GET", path, {
    auth: true,
    origin: api.firebaseApiOrigin,
  });
  projects = projects.concat(response.body.results);
  if (response.body.nextPageToken) {
    return listProjects(response.body.nextPageToken, projects);
  }
  return projects;
}

export async function getProject(projectId: string): Promise<FirebaseProject> {
  const response = await api.request("GET", `/${API_VERSION}/projects/${projectId}`, {
    auth: true,
    origin: api.firebaseApiOrigin,
  });
  return response.body;
}
