import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { getFirebaseProjectPage } from "../../../management/projects.js";
import { FirebaseProjectMetadata } from "../../../types/project/index.d.js";

const PROJECT_LIST_PAGE_SIZE = 10;

export const list_projects = tool(
  {
    name: "list_projects",
    description: "Retrieves a list of Firebase projects up to the specified total count.",
    inputSchema: z.object({
      page_size: z
        .number()
        .min(1)
        .default(PROJECT_LIST_PAGE_SIZE)
        .describe("the number of projects to list per page (defaults to 10)"),
      page_token: z
        .string()
        .optional()
        .describe("the page token to start listing from"),
    }),
    annotations: {
      title: "List Firebase Projects",
      readOnlyHint: true,
      idempotentHint: true,
    },
    _meta: {
      requiresAuth: true,
    },
  },
  async ({ page_size, page_token }) => {
    const projectPage = await getFirebaseProjectPage(page_size, page_token);
    
    let message = "";
    if (projectPage.nextPageToken) {
      message = `Here are ${projectPage.projects.length} Firebase projects.\n\n` +
        `To list more projects, call this tool again with page_token: "${projectPage.nextPageToken}"`;
    }

    return toContent({
      message,
      projects: projectPage.projects,
      next_page_token: projectPage.nextPageToken,
    });
  },
);
