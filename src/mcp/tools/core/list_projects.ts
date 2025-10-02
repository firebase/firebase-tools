import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { getFirebaseProjectPage } from "../../../management/projects";

const PROJECT_LIST_PAGE_SIZE = 20;

export const list_projects = tool(
  {
    name: "list_projects",
    description:
      "Use this to retrieve a list of Firebase Projects that the signed-in user has access to.",
    inputSchema: z.object({
      page_size: z
        .number()
        .min(1)
        .default(PROJECT_LIST_PAGE_SIZE)
        .describe("the number of projects to list per page (defaults to 1000)"),
      page_token: z.string().optional().describe("the page token to start listing from"),
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
    try {
      const projectPage = await getFirebaseProjectPage(page_size, page_token);

      return toContent(
        {
          projects: projectPage.projects,
          next_page_token: projectPage.nextPageToken,
        },
        {
          contentPrefix: `Here are ${projectPage.projects.length} Firebase projects${page_token ? " (continued)" : ""}:\n\n`,
          contentSuffix: projectPage.nextPageToken
            ? "\nThere are more projects available. To see the next page, call this tool again with the next_page_token shown above."
            : "",
        },
      );
    } catch (err: any) {
      const originalMessage = err.original ? `: ${err.original.message}` : "";
      throw new Error(`Failed to list Firebase projects${originalMessage}`);
    }
  },
);
