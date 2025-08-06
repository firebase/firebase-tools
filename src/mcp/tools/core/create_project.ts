import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import {
  checkFirebaseEnabledForCloudProject,
  createFirebaseProjectAndLog,
  addFirebaseToCloudProject,
  getProject,
  ProjectInfo,
} from "../../../management/projects";
import { getErrStatus } from "../../../error";

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

export const create_project = tool(
  {
    name: "create_project",
    description: "Creates a new Firebase project.",
    inputSchema: z.object({
      project_id: z.string().describe("The project ID to create or use."),
      display_name: z
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
  async ({ project_id, display_name }) => {
    try {
      // Check if cloud project exists
      const cloudProject = await checkCloudProject(project_id);

      // If project doesn't exist, create it and add Firebase
      if (!cloudProject) {
        const newProject = await createFirebaseProjectAndLog(project_id, {
          displayName: display_name,
        });
        return toContent({
          message: `Successfully created new Firebase project: ${project_id}`,
          project: newProject,
        });
      }

      // Check if Firebase is enabled
      let firebaseProject = await checkFirebaseEnabledForCloudProject(project_id);
      if (firebaseProject) {
        return toContent({
          message: `Project ${project_id} already exists and has Firebase enabled.`,
          project: firebaseProject,
        });
      }

      // Project exists but Firebase is not enabled
      firebaseProject = await addFirebaseToCloudProject(project_id);
      return toContent({
        message: `Successfully added Firebase to existing project: ${project_id}`,
        project: firebaseProject,
      });
    } catch (err: any) {
      const originalMessage = err.original ? `: ${err.original.message}` : "";
      throw new Error(`${err.message}\nOriginal error: ${originalMessage}`);
    }
  },
);
