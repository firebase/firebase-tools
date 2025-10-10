import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { getAliases } from "../../../projectUtils";
import { dump } from "js-yaml";
import { getAllAccounts } from "../../../auth";
import { configstore } from "../../../configstore";
import { detectApps } from "../../../appUtils";

export const get_environment = tool(
  {
    name: "get_environment",
    description:
      "Use this to retrieve the current Firebase **environment** configuration for the Firebase CLI and Firebase MCP server, including current authenticated user, project directory, active Firebase Project, and more.",
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
    const geminiTosAccepted = !!configstore.get("gemini");
    const projectFileExists = config.projectFileExists("firebase.json");
    const detectedApps = await detectApps(process.cwd());
    const allAccounts = getAllAccounts().map((account) => account.user.email);
    const hasOtherAccounts = allAccounts.filter((email) => email !== accountEmail).length > 0;

    const projectConfigPathString = projectFileExists
      ? config.path("firebase.json")
      : "<NO CONFIG PRESENT>";
    const detectedAppsMap = detectedApps
      .filter((app) => !!app.appId)
      .reduce((map, app) => {
        if (app.appId) {
          map.set(app.appId, app.bundleId ? app.bundleId : "<UNKNOWN BUNDLE ID>");
        }
        return map;
      }, new Map<string, string>());
    const activeProjectString = projectId
      ? `${projectId}${aliases.length ? ` (alias: ${aliases.join(",")})` : ""}`
      : "<NONE>";
    const acceptedGeminiTosString = geminiTosAccepted ? "Accepted" : "<NOT ACCEPTED>";
    return toContent(`# Environment Information

Project Directory: ${host.cachedProjectDir}
Project Config Path: ${projectConfigPathString}
Active Project ID: ${activeProjectString}
Gemini in Firebase Terms of Service: ${acceptedGeminiTosString}
Authenticated User: ${accountEmail || "<NONE>"}
Detected App IDs: ${detectedAppsMap.size > 0 ? `\n\n${dump(Object.fromEntries(detectedAppsMap)).trim()}\n` : "<NONE>"}
Available Project Aliases (format: '[alias]: [projectId]'): ${Object.entries(rc.projects).length > 0 ? `\n\n${dump(rc.projects).trim()}\n` : "<NONE>"}${
      hasOtherAccounts ? `\nAvailable Accounts: \n\n${dump(allAccounts).trim()}` : ""
    }
${
  projectFileExists
    ? `\nfirebase.json contents:

\`\`\`json
${config.readProjectFile("firebase.json")}
\`\`\``
    : `\nNo firebase.json file was found.
      
If this project does not use Firebase services that require a firebase.json file, no action is necessary.

If this project uses Firebase services that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`
}`);
  },
);
