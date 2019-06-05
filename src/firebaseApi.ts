import * as api from "./api";
import { Project } from "./project";

const API_VERSION = "v1beta1";

export function listProjects(nextPageToken?: string, projectsList?: Project[]): Promise<Project[]> {
  let projects = projectsList || [];

  let path = `/${API_VERSION}/projects?page_size=100`;
  if (nextPageToken) {
    path += `&page_token=${nextPageToken}`;
  }

  return api
    .request("GET", path, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then((response) => {
      projects = projects.concat(response.body.results);
      if (response.body.nextPageToken) {
        return listProjects(response.body.nextPageToken, projects);
      }
      return projects;
    });
}

export function getProject(projectId: string): Promise<Project> {
  return api
    .request("GET", `/${API_VERSION}/projects/${projectId}`, {
      auth: true,
      origin: api.firebaseApiOrigin,
    })
    .then((response) => response.body);
}
