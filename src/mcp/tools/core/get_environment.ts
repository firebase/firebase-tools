import { z } from "zod";
import { tool } from "../../tool";
import { toContent } from "../../util";
import { getAliases } from "../../../projectUtils";
import { dump } from "js-yaml";
import { getAllAccounts } from "../../../auth";
import { configstore } from "../../../configstore";
import { detectApps } from "../../../appUtils";

interface EnvironmentTemplateValues {
  // The active project for this directory
  projectId?: string;

  // Aliases for the active project
  projectAliases: string[];

  // The directory relevant for this project
  projectDir?: string;

  // The path to the firebase.json file
  projectConfigPath?: string;

  // Whether the user has accepted Gemini in Firebase TOS
  geminiTosAccepted: boolean;

  // Whether billing is enabled for the project
  isBillingEnabled: boolean;

  // The authenticated user identifier
  authenticatedUser?: string;

  // The list of available accounts (inclusive of the authenticated user)
  allAccounts: string[];

  // Firebase app ids detected in this directory
  detectedAppIds: Record<string, string>;

  // A map from a project alias to the project id
  projectAliasMap: Record<string, string>;

  // The contents of the firebase.json file if found
  projectFileContents?: string;
}

/**
 * Hydrate the template for the get_environment tool response
 */
export function hydrateTemplate(config: EnvironmentTemplateValues): string {
  const activeProject = config.projectId
    ? `${config.projectId}${config.projectAliases.length ? ` (alias: ${config.projectAliases.join(",")})` : ""}`
    : "<NONE>";
  const projectConfigPath = config.projectConfigPath || "<NO CONFIG PRESENT>";
  const geminiTosAccepted = config.geminiTosAccepted ? "Accepted" : "<NOT ACCEPTED>";
  const billingEnabled = config.projectId ? (config.isBillingEnabled ? "Yes" : "No") : "N/A";
  const authenticatedUser = config.authenticatedUser || "<NONE>";
  const detectedApps =
    Object.entries(config.detectedAppIds).length > 0
      ? `\n\n${dump(config.detectedAppIds).trim()}\n`
      : "<NONE>";
  const availableProjects =
    Object.entries(config.projectAliasMap).length > 0
      ? `\n\n${dump(config.projectAliasMap)}`
      : "<NONE>";
  const hasOtherAccounts =
    config.allAccounts.filter((email) => email !== config.authenticatedUser).length > 0;
  const availableAccounts = hasOtherAccounts ? `${dump(config.allAccounts).trim()}` : "";

  return `# Environment Information

Project Directory: ${config.projectDir}
Project Config Path: ${projectConfigPath}
Active Project ID: ${activeProject}
Gemini in Firebase Terms of Service: ${geminiTosAccepted}
Billing Enabled: ${billingEnabled}
Authenticated User: ${authenticatedUser}
Detected App IDs: ${detectedApps}
Available Project Aliases (format: '[alias]: [projectId]'): ${availableProjects}${hasOtherAccounts ? `\nAvailable Accounts: \n\n${availableAccounts}` : ""}
${
  config.projectFileContents
    ? `\nfirebase.json contents:

\`\`\`json
${config.projectFileContents}
\`\`\``
    : `\nNo firebase.json file was found.

If this project does not use Firebase services that require a firebase.json file, no action is necessary.

If this project uses Firebase services that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`
}`;
}

export const get_environment = tool(
  "core",
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
  async (_, { projectId, host, accountEmail, rc, config, isBillingEnabled }) => {
    const aliases = projectId ? getAliases({ rc }, projectId) : [];
    const geminiTosAccepted = !!configstore.get("gemini");
    const projectFileExists = config.projectFileExists("firebase.json");
    const detectedApps = await detectApps(process.cwd());
    const allAccounts = getAllAccounts().map((account) => account.user.email);

    const detectedAppsMap: { [appId: string]: string } = {};
    detectedApps
      .filter((app) => !!app.appId)
      .reduce((map, app) => {
        if (app.appId) {
          map[app.appId] = app.bundleId ? app.bundleId : "<UNKNOWN BUNDLE ID>";
        }
        return map;
      }, detectedAppsMap);

    const environmentTemplateConfig: EnvironmentTemplateValues = {
      projectId,
      projectAliases: aliases,
      projectDir: host.cachedProjectDir,
      projectConfigPath: projectFileExists ? config.path("firebase.json") : undefined,
      geminiTosAccepted,
      isBillingEnabled,
      authenticatedUser: accountEmail || undefined,
      projectAliasMap: rc.projects,
      allAccounts,
      detectedAppIds: detectedAppsMap,
      projectFileContents: projectFileExists ? config.readProjectFile("firebase.json") : undefined,
    };
    return toContent(hydrateTemplate(environmentTemplateConfig));
  },
);
