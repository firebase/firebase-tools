import { z } from "zod";
import { tool } from "../../tool";
import { mcpError, toContent } from "../../util";
import { setNewActive } from "../../../commands/use";
import { assertAccount, setProjectAccount } from "../../../auth";
import { existsSync } from "node:fs";

export const update_environment = tool(
  "core",
  {
    name: "update_environment",
    description:
      "Use this to update environment config for the Firebase CLI and Firebase MCP server, such as project directory, active project, active user account, accept terms of service, and more. Use `firebase_get_environment` to see the currently configured environment.",
    inputSchema: z.object({
      project_dir: z
        .string()
        .optional()
        .describe(
          "Change the current project directory - this should be a directory that has a `firebase.json` file (or will have one).",
        ),
      active_project: z
        .string()
        .optional()
        .describe(
          "Change the active project for the current project directory. Should be a Firebase project ID or configured project alias.",
        ),
      active_user_account: z
        .string()
        .optional()
        .describe(
          "The email address of the signed-in user to authenticate as when interacting with the current project directory.",
        ),
    }),
    annotations: {
      title: "Update Firebase Environment",
      readOnlyHint: false,
    },
    _meta: {
      optionalProjectDir: true,
      requiresAuth: false,
      requiresProject: false,
    },
  },
  async ({ project_dir, active_project, active_user_account }, { config, rc, host }) => {
    let output = "";
    if (project_dir) {
      if (!existsSync(project_dir))
        return mcpError(
          `Cannot update project directory to '${project_dir}' as it does not exist.`,
        );
      host.setProjectRoot(project_dir);
      output += `- Updated project directory to '${project_dir}'\n`;
    }
    if (active_project) {
      await setNewActive(active_project, undefined, rc, config.projectDir);
      output += `- Updated active project to '${active_project}'\n`;
    }
    if (active_user_account) {
      assertAccount(active_user_account, { mcp: true });
      setProjectAccount(host.cachedProjectDir!, active_user_account);
      output += `- Updated active account to '${active_user_account}'\n`;
    }
    if (output === "") output = "No changes were made.";
    return toContent(output);
  },
);
