import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import {
  createFirebaseProjectAndLog,
  getFirebaseProject,
  addFirebaseToCloudProject,
  getProject,
  ProjectInfo,
} from "../../../management/projects.js";
import { FirebaseProjectMetadata } from "../../../types/project";
import { getErrStatus } from "../../../error.js";

/**
 * Checks if a Cloud project exists and the user has access to it
 */
async function checkCloudProject(projectId: string): Promise<ProjectInfo | undefined> {
  try {
    return await getProject(projectId);
  } catch (err: any) {
    if (getErrStatus(err) === 403) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Checks if Firebase is enabled for a project
 */
async function checkFirebaseEnabled(
  projectId: string,
): Promise<FirebaseProjectMetadata | undefined> {
  try {
    return await getFirebaseProject(projectId);
  } catch (err: any) {
    if (getErrStatus(err) === 403) {
      return undefined;
    }
    throw err;
  }
}

export const create_project = tool(
  {
    name: "create_project",
    description: "Creates a new Firebase project or returns an existing one.",
    inputSchema: z.object({
      projectId: z.string().describe("The project ID to create or use."),
      displayName: z
        .string()
        .optional()
        .describe("The user-friendly display name for the project."),
    }),
    annotations: {
      title: "Create Firebase Project",
      destructiveHint: false,
      readOnlyHint: false,
    },
    _meta: {
      requiresAuth: true,
      requiresProject: false,
    },
  },
  async ({ projectId, displayName }) => {
    // Check if cloud project exists
    const cloudProject = await checkCloudProject(projectId);

    // If project doesn't exist, create it and add Firebase
    if (!cloudProject) {
      const newProject = await createFirebaseProjectAndLog(projectId, {
        displayName: displayName,
      });
      return toContent({
        message: `Successfully created new Firebase project: ${projectId}`,
        project: newProject,
      });
    }

    // Check if Firebase is enabled
    let firebaseProject = await checkFirebaseEnabled(projectId);
    if (firebaseProject) {
      return toContent({
        message: `Project ${projectId} already exists and has Firebase enabled.`,
        project: firebaseProject,
      });
    }

    // Project exists but Firebase is not enabled
    firebaseProject = await addFirebaseToCloudProject(projectId);
    return toContent({
      message: `Successfully added Firebase to existing project: ${projectId}`,
      project: firebaseProject,
    });
  },
);
