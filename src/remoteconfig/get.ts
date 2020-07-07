import { FirebaseProjectMetadata, ProjectPage, getFirebaseProjectPage, CloudProjectInfo } from "../management/projects";
import * as api from "../api";
import * as logger from "../logger";
import { FirebaseError } from "../error";
import * as _ from "lodash";
import * as utils from "../utils";
import { promptOnce } from "../prompt";
import * as clc from "cli-color";
const TIMEOUT = 30000;

const TIMEOUT_MILLIS = 30000;
const MAXIMUM_PROMPT_LIST = 100;
const PROJECT_LIST_PAGE_SIZE = 1000;
const CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS = 15000;

export interface RemoteConfigTemplateData {
  parameterGroups: JSON; conditions:JSON; parameters:JSON; version:JSON 
}
export interface ParameterGroupsData {name:JSON; expression:JSON}

/**
 * Returns a list of projects to choose from. Gets project information for the selected project.
 */
async function selectProjectFromList(
    projects: FirebaseProjectMetadata[] = []
  ): Promise<FirebaseProjectMetadata> {
    let choices = projects
      .filter((p: FirebaseProjectMetadata) => !!p)
      .map((p) => {
        return {
          name: p.projectId + (p.displayName ? ` (${p.displayName})` : ""),
          value: p.projectId,
        };
      });
    choices = _.orderBy(choices, ["name"], ["asc"]);
  
    if (choices.length >= 25) {
      utils.logBullet(
        `Don't want to scroll through all your projects? If you know your project ID, ` +
          `you can initialize it directly using ${clc.bold(
            "firebase init --project <project_id>"
          )}.\n`
      );
    }
    const projectId: string = await promptOnce({
      type: "list",
      name: "id",
      message: "Select a default Firebase project for this directory:",
      choices,
    });
  
    const project = projects.find((p) => p.projectId === projectId);
  
    if (!project) {
      throw new FirebaseError("Unexpected error. Project does not exist");
    }
  
    return project;
  }

function getProjectId(cloudProject: CloudProjectInfo): string {
    const resourceName = cloudProject.project;
    // According to
    // https://firebase.google.com/docs/projects/api/reference/rest/v1beta1/availableProjects/list#projectinfo,
    // resource name has the format of "projects/projectId"
    return resourceName.substring(resourceName.lastIndexOf("/") + 1);
  }
  
/**
 * Returns a list of all Firebase projects associated with the user's logged-in account. Calls paginated API until all pages have been read.
 * @return a promise that resolves to the list of all projects.
 */
export async function listFirebaseProjects(pageSize?: number): Promise<FirebaseProjectMetadata[]> {
    const projects: FirebaseProjectMetadata[] = [];
    let nextPageToken;
  
    do {
      const projectPage: ProjectPage<FirebaseProjectMetadata> = await getFirebaseProjectPage(
        pageSize,
        nextPageToken
      );
      projects.push(...projectPage.projects);
      nextPageToken = projectPage.nextPageToken;
    } while (nextPageToken);
  
    return projects;
  }
  

/**Gets Firebase project information based on project ID */
export async function getFirebaseProject(projectId: string): Promise<RemoteConfigTemplateData> {
    try {
      const response = await api.request("GET", `/v1/projects/${projectId}/remoteConfig`, {
        auth: true,
        origin: api.firebaseRemoteConfigApiOrigin,
        timeout: TIMEOUT,
      });
      return response.body;
    } catch (err) {
      logger.debug(err.message);
      throw new FirebaseError(
        `Failed to get Firebase project ${projectId}. ` +
          "Please make sure the project exists and your account has permission to access it.",
        { exit: 2, original: err }
      );
    }
}

