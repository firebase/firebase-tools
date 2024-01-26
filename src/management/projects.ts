import * as clc from "colorette";
import * as ora from "ora";

import { Client } from "../apiv2";
import { FirebaseError } from "../error";
import { pollOperation } from "../operation-poller";
import { Question, promptOnce } from "../prompt";
import * as api from "../api";
import { logger } from "../logger";
import * as utils from "../utils";
import { FirebaseProjectMetadata, CloudProjectInfo, ProjectPage } from "../types/project";

const TIMEOUT_MILLIS = 30000;
const MAXIMUM_PROMPT_LIST = 100;
const PROJECT_LIST_PAGE_SIZE = 1000;
const CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS = 15000;

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

const firebaseAPIClient = new Client({
  urlPrefix: api.firebaseApiOrigin,
  auth: true,
  apiVersion: "v1beta1",
});

export async function createFirebaseProjectAndLog(
  projectId: string,
  options: { displayName?: string; parentResource?: ProjectParentResource },
): Promise<FirebaseProjectMetadata> {
  const spinner = ora("Creating Google Cloud Platform project").start();

  try {
    await createCloudProject(projectId, options);
    spinner.succeed();
  } catch (err: any) {
    spinner.fail();
    throw err;
  }

  return addFirebaseToCloudProjectAndLog(projectId);
}

export async function addFirebaseToCloudProjectAndLog(
  projectId: string,
): Promise<FirebaseProjectMetadata> {
  let projectInfo;
  const spinner = ora("Adding Firebase resources to Google Cloud Platform project").start();

  try {
    projectInfo = await addFirebaseToCloudProject(projectId);
  } catch (err: any) {
    spinner.fail();
    throw err;
  }

  spinner.succeed();
  logNewFirebaseProjectInfo(projectInfo);
  return projectInfo;
}

function logNewFirebaseProjectInfo(projectInfo: FirebaseProjectMetadata): void {
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
  logger.info(
    `https://console.firebase.google.com/project/${clc.bold(projectInfo.projectId)}/overview`,
  );
}

/**
 * Get the user's desired project, prompting if necessary.
 */
export async function getOrPromptProject(options: any): Promise<FirebaseProjectMetadata> {
  if (options.project) {
    return await getFirebaseProject(options.project);
  }
  return selectProjectInteractively();
}

async function selectProjectInteractively(
  pageSize: number = MAXIMUM_PROMPT_LIST,
): Promise<FirebaseProjectMetadata> {
  const { projects, nextPageToken } = await getFirebaseProjectPage(pageSize);
  if (projects.length === 0) {
    throw new FirebaseError("There are no Firebase projects associated with this account.");
  }
  if (nextPageToken) {
    // Prompt user for project ID if we can't list all projects in 1 page
    logger.debug(`Found more than ${projects.length} projects, selecting via prompt`);
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
  projects: FirebaseProjectMetadata[] = [],
): Promise<FirebaseProjectMetadata> {
  const choices = projects
    .filter((p: FirebaseProjectMetadata) => !!p)
    .map((p) => {
      return {
        name: p.projectId + (p.displayName ? ` (${p.displayName})` : ""),
        value: p.projectId,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (choices.length >= 25) {
    utils.logBullet(
      `Don't want to scroll through all your projects? If you know your project ID, ` +
        `you can initialize it directly using ${clc.bold(
          "firebase init --project <project_id>",
        )}.\n`,
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
 * Prompt user to select an available GCP project to add Firebase resources
 */
export async function promptAvailableProjectId(): Promise<string> {
  const { projects, nextPageToken } = await getAvailableCloudProjectPage(MAXIMUM_PROMPT_LIST);
  if (projects.length === 0) {
    throw new FirebaseError(
      "There are no available Google Cloud projects to add Firebase services.",
    );
  }

  if (nextPageToken) {
    // Prompt for project ID if we can't list all projects in 1 page
    return await promptOnce({
      type: "input",
      message: "Please input the ID of the Google Cloud Project you would like to add Firebase:",
    });
  } else {
    const choices = projects
      .filter((p: CloudProjectInfo) => !!p)
      .map((p) => {
        const projectId = getProjectId(p);
        return {
          name: projectId + (p.displayName ? ` (${p.displayName})` : ""),
          value: projectId,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return await promptOnce({
      type: "list",
      name: "id",
      message: "Select the Google Cloud Platform project you would like to add Firebase:",
      choices,
    });
  }
}

/**
 * Send an API request to create a new Google Cloud Platform project and poll the LRO to get the
 * new project information.
 * @return a promise that resolves to the new cloud project information
 */
export async function createCloudProject(
  projectId: string,
  options: { displayName?: string; parentResource?: ProjectParentResource },
): Promise<any> {
  try {
    const client = new Client({ urlPrefix: api.resourceManagerOrigin, apiVersion: "v1" });
    const data = {
      projectId,
      name: options.displayName || projectId,
      parent: options.parentResource,
    };
    const response = await client.request<any, { name: string }>({
      method: "POST",
      path: "/projects",
      body: data,
      timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
    });
    const projectInfo = await pollOperation<any>({
      pollerName: "Project Creation Poller",
      apiOrigin: api.resourceManagerOrigin,
      apiVersion: "v1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return projectInfo;
  } catch (err: any) {
    if (err.status === 409) {
      throw new FirebaseError(
        `Failed to create project because there is already a project with ID ${clc.bold(
          projectId,
        )}. Please try again with a unique project ID.`,
        {
          exit: 2,
          original: err,
        },
      );
    } else {
      throw new FirebaseError("Failed to create project. See firebase-debug.log for more info.", {
        exit: 2,
        original: err,
      });
    }
  }
}

/**
 * Send an API request to add Firebase to the Google Cloud Platform project and poll the LRO
 * to get the new Firebase project information.
 * @return a promise that resolves to the new firebase project information
 */
export async function addFirebaseToCloudProject(
  projectId: string,
): Promise<FirebaseProjectMetadata> {
  try {
    const response = await firebaseAPIClient.request<any, { name: string }>({
      method: "POST",
      path: `/projects/${projectId}:addFirebase`,
      timeout: CREATE_PROJECT_API_REQUEST_TIMEOUT_MILLIS,
    });
    const projectInfo = await pollOperation<any>({
      pollerName: "Add Firebase Poller",
      apiOrigin: api.firebaseApiOrigin,
      apiVersion: "v1beta1",
      operationResourceName: response.body.name /* LRO resource name */,
    });
    return projectInfo;
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to add Firebase to Google Cloud Platform project. See firebase-debug.log for more info.",
      { exit: 2, original: err },
    );
  }
}

async function getProjectPage<T>(
  apiResource: string,
  options: {
    responseKey: string; // The list is located at "apiResponse.body[responseKey]"
    pageSize: number;
    pageToken?: string;
  },
): Promise<ProjectPage<T>> {
  const queryParams: { [key: string]: string } = {
    pageSize: `${options.pageSize}`,
  };
  if (options.pageToken) {
    queryParams.pageToken = options.pageToken;
  }
  const res = await firebaseAPIClient.request<void, { [key: string]: T[] | string | undefined }>({
    method: "GET",
    path: apiResource,
    queryParams,
    timeout: TIMEOUT_MILLIS,
    skipLog: { resBody: true },
  });
  const projects = res.body[options.responseKey];
  const token = res.body.nextPageToken;
  return {
    projects: Array.isArray(projects) ? projects : [],
    nextPageToken: typeof token === "string" ? token : undefined,
  };
}

/**
 * Lists Firebase projects in a page using the paginated API, identified by the page token and its
 * size.
 */
export async function getFirebaseProjectPage(
  pageSize: number = PROJECT_LIST_PAGE_SIZE,
  pageToken?: string,
): Promise<ProjectPage<FirebaseProjectMetadata>> {
  let projectPage;

  try {
    projectPage = await getProjectPage<FirebaseProjectMetadata>("/projects", {
      responseKey: "results",
      pageSize,
      pageToken,
    });
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to list Firebase projects. See firebase-debug.log for more info.",
      { exit: 2, original: err },
    );
  }

  return projectPage;
}

/**
 * Lists a page of available Google Cloud Platform projects that are available to have Firebase
 * resources added, using the paginated API, identified by the page token and its size.
 */
export async function getAvailableCloudProjectPage(
  pageSize: number = PROJECT_LIST_PAGE_SIZE,
  pageToken?: string,
): Promise<ProjectPage<CloudProjectInfo>> {
  try {
    return await getProjectPage<CloudProjectInfo>("/availableProjects", {
      responseKey: "projectInfo",
      pageSize,
      pageToken,
    });
  } catch (err: any) {
    logger.debug(err.message);
    throw new FirebaseError(
      "Failed to list available Google Cloud Platform projects. See firebase-debug.log for more info.",
      { exit: 2, original: err },
    );
  }
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
    const projectPage: ProjectPage<FirebaseProjectMetadata> = await getFirebaseProjectPage(
      pageSize,
      nextPageToken,
    );
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
    const res = await firebaseAPIClient.request<void, FirebaseProjectMetadata>({
      method: "GET",
      path: `/projects/${projectId}`,
      timeout: TIMEOUT_MILLIS,
    });
    return res.body;
  } catch (err: any) {
    let message = err.message;
    if (err.original) {
      message += ` (original: ${err.original.message})`;
    }
    logger.debug(message);
    throw new FirebaseError(
      `Failed to get Firebase project ${projectId}. ` +
        "Please make sure the project exists and your account has permission to access it.",
      { exit: 2, original: err },
    );
  }
}
