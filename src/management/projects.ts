import * as api from "../api";
import * as clc from "cli-color";
import * as ora from "ora";
import * as _ from "lodash";

import * as FirebaseError from "../error";
import * as logger from "../logger";
import { pollOperation } from "../operation-poller";
import { Question } from "inquirer";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

const TIMEOUT_MILLIS = 30000;
const MAXIMUM_PROMPT_LIST = 100;
const PROJECT_LIST_PAGE_SIZE = 1000;
const CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS = 15000;

export interface FirebaseProjectPage {
  projects: FirebaseProjectMetadata[];
  nextPageToken?: string;
}

export interface FirebaseProjectMetadata {
  name: string /* The fully qualified resource name of the Firebase project */;
  projectId: string;
  projectNumber: string;
  displayName: string;
  resources?: DefaultProjectResources;
}

export interface DefaultProjectResources {
  hostingSite?: string;
  realtimeDatabaseInstance?: string;
  storageBucket?: string;
  locationId?: string;
}

export enum ProjectParentResourceType {
  ORGANIZATION = "organization",
  FOLDER = "folder",
}

export interface ProjectParentResource {
  id: string;
  type: ProjectParentResourceType;
}

export const PROJECTS_CREATE_QUESTIONS: Question[] = [
  {
    type: "input",
    name: "projectId",
    default: "",
    message:
      "Please specify a unique project id " +
      `(${clc.yellow("warning")}: cannot be modified afterward) [6-30 characters]:\n`,
  },
  {
    type: "input",
    name: "displayName",
    default: "",
    message: "What would you like to call your project? (defaults to your project ID)",
  },
];

export async function createFirebaseProjectAndLog(
  projectId: string,
  options: { displayName?: string; parentResource?: ProjectParentResource }
): Promise<FirebaseProjectMetadata> {
  let spinner = ora("Creating Google Cloud Platform project").start();
  try {
    await createCloudProject(projectId, options);
    spinner.succeed();

    spinner = ora("Adding Firebase to Google Cloud project").start();
    const projectInfo = await addFirebaseToCloudProject(projectId);
    spinner.succeed();

    logger.info("");
    if (process.platform === "win32") {
      logger.info("=== Your Firebase project is ready! ===");
    } else {
      logger.info("🎉🎉🎉 Your Firebase project is ready! 🎉🎉🎉");
    }
    logger.info("");
    logger.info("Project information:");
    logger.info(`   - Project ID: ${clc.bold(projectInfo.projectId)}`);
    logger.info(`   - Project Name: ${clc.bold(projectInfo.displayName)}`);
    logger.info("");
    logger.info("Firebase console is available at");
    logger.info(`https://console.firebase.google.com/project/${clc.bold(projectId)}/overview`);
    return projectInfo;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}

/**
 * Get the user's desired project, prompting if necessary.
 */
export async function getOrPromptDesiredProject(options: any): Promise<FirebaseProjectMetadata> {
  if (options.project) {
    return await getFirebaseProject(options.project);
  }
  return selectProjectInteractively();
}

async function selectProjectInteractively(
  pageSize: number = MAXIMUM_PROMPT_LIST
): Promise<FirebaseProjectMetadata> {
  const { projects, nextPageToken } = await getProjectPage(pageSize);
  if (projects.length === 0) {
    throw new FirebaseError("There is no Firebase project associated with this account.");
  }
  if (nextPageToken) {
    // Prompt user for project ID if we can't list all projects in 1 page
    return selectProjectByPrompting();
  }
  return selectProjectFromList(projects);
}

async function selectProjectByPrompting(): Promise<FirebaseProjectMetadata> {
  const projectId = await promptOnce({
    type: "input",
    message: "Please input the project ID you would like to use:",
  });

  return await getFirebaseProject(projectId);
}

/**
 * Presents user with list of projects to choose from and gets project information for chosen project.
 */
async function selectProjectFromList(
  projects: FirebaseProjectMetadata[] = []
): Promise<FirebaseProjectMetadata> {
  let choices = projects.filter((p: FirebaseProjectMetadata) => !!p).map((p) => {
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

  let project: FirebaseProjectMetadata | undefined;
  project = projects.find((p) => p.projectId === projectId);

  if (!project) {
    throw new FirebaseError("Unexpected error. Chosen project must exist");
  }

  return project;
}

/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return a promise that resolves to the new cloud project information
 */
export async function createCloudProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ProjectParentResource }
): Promise<any> {
  try {
    const response = await api.request("POST", "/v1/projects", {
      auth: true,
      origin: api.resourceManagerOrigin,
      timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
      data: { projectId, name: options.displayName || projectId, parent: options.parentResource },
    });

    const projectInfo = await pollOperation<any>({
      pollerName: "Project Creation Poller",
      apiOrigin: api.resourceManagerOrigin,
      apiVersion: "v1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return projectInfo;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to create Google Cloud project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}

/**
 * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
 * to get the new Firebase project information.
 * @return a promise that resolves to the new firebase project information
 */
export async function addFirebaseToCloudProject(projectId: string): Promise<any> {
  try {
    const response = await api.request("POST", `/v1beta1/projects/${projectId}:addFirebase`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
    });
    const projectInfo = await pollOperation<any>({
      pollerName: "Add Firebase Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return projectInfo;
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }
}

/**
 * Lists Firebase projects in a page using the paginated API, identified by the page token and its
 * size.
 */
export async function getProjectPage(
  pageSize: number = PROJECT_LIST_PAGE_SIZE,
  pageToken?: string
): Promise<FirebaseProjectPage> {
  let apiResponse;

  try {
    const pageTokenQueryString = pageToken ? `&pageToken=${pageToken}` : "";
    apiResponse = await api.request(
      "GET",
      `/v1beta1/projects?pageSize=${pageSize}${pageTokenQueryString}`,
      {
        auth: true,
        origin: api.firebaseApiOrigin,
        timeout: TIMEOUT_MILLIS,
      }
    );
  } catch (err) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to list Firebase projects. See firebase-debug.log for more info.",
      { exit: 2, original: err }
    );
  }

  return {
    projects: apiResponse.body.results || [],
    nextPageToken: apiResponse.body.nextPageToken,
  };
}

/**
 * Lists all Firebase projects associated with the currently logged-in account. Repeatedly calls the
 * paginated API until all pages have been read.
 * @return a promise that resolves to the list of all projects.
 */
export async function listFirebaseProjects(pageSize?: number): Promise<FirebaseProjectMetadata[]> {
  const projects: FirebaseProjectMetadata[] = [];
  let nextPageToken;

  do {
    const projectPage: FirebaseProjectPage = await getProjectPage(pageSize, nextPageToken);
    projects.push(...projectPage.projects);
    nextPageToken = projectPage.nextPageToken;
  } while (nextPageToken);

  return projects;
}

/**
 * Gets the Firebase project information identified by the specified project ID
 */
export async function getFirebaseProject(projectId: string): Promise<FirebaseProjectMetadata> {
  try {
    const response = await api.request("GET", `/v1beta1/projects/${projectId}`, {
      auth: true,
      origin: api.firebaseApiOrigin,
      timeout: TIMEOUT_MILLIS,
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
