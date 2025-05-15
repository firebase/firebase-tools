import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { getAliases } from "../../../projectUtils.js";
import { dump } from "js-yaml";
import { getAllAccounts } from "../../../auth.js";

export const get_environment = tool(
  {
    name: "get_environment",
    description:
      "Retrieves information about the current Firebase environment including current authenticated user, project directory, active project, and more.",
    inputSchema: z.object({}),
    annotations: {
      title: "Get Firebase Environment Info",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: false,
      requiresProject: false,
    },
  },
  async (_, { projectId, host, accountEmail, rc, config }) => {
    const aliases = projectId ? getAliases({ rc }, projectId) : [];
    return toContent(`# Environment Information

Project Directory: ${host.cachedProjectRoot}
Project Config Path: ${config.projectFileExists("firebase.json") ? config.path("firebase.json") : "<NO CONFIG PRESENT>"}
Active Project ID: ${
      projectId ? `${projectId}${aliases.length ? ` (alias: ${aliases.join(",")})` : ""}` : "<NONE>"
    }
Authenticated User: ${accountEmail || "<NONE>"}

# Available Project Aliases (format: '[alias]: [projectId]')

${dump(rc.projects).trim()}

# Available Accounts:

${dump(getAllAccounts().map((account) => account.user.email)).trim()}
${
  config.projectFileExists("firebase.json")
    ? `
# firebase.json contents:

\`\`\`json
${config.readProjectFile("firebase.json")}
\`\`\``
    : `\n# Empty Environment

It looks like the current directory is not initialized as a Firebase project. The user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.`
}`);
  },
);
