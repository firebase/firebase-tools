import * as path from "path";
import * as vscode from "vscode";
import { transports, format } from "winston";
import stripAnsi from "strip-ansi";
import { SPLAT } from "triple-beam";
import { ExtensionContext, workspace } from "vscode";

import { FirebaseProjectMetadata } from "../../src/types/project";
import { ExtensionBrokerImpl } from "./extension-broker";
import {
  deployToHosting,
  getAccounts,
  listProjects,
  login,
  logoutUser,
  initHosting,
  getChannels,
} from "./cli";
import { User } from "../../src/types/auth";
import { currentOptions } from "./options";
import { ServiceAccountUser } from "./types";
import { selectProjectInMonospace } from "../../src/monospace";
import { setupLoggers, tryStringify } from "../../src/utils";
import { pluginLogger } from "./logger-wrapper";
import { logger } from '../../src/logger';
import { discover } from "../../src/frameworks";
import { setEnabled } from "../../src/experiments";
import {
  readAndSendFirebaseConfigs,
  setupFirebaseJsonAndRcFileSystemWatcher,
  updateFirebaseRCProject,
  getRootFolders
} from "./configs";

let users: Array<ServiceAccountUser | User> = [];
let currentUserEmail = "";
// Stores a mapping from user email to list of projects for that user
let projectsUserMapping = new Map<string, FirebaseProjectMetadata[]>();
let channels = null;

async function fetchUsers() {
  const accounts = await getAccounts();
  users = accounts.map((account) => account.user);
}

/**
 * Get the user to select a project.
 */
async function promptUserForProject(
  projects: FirebaseProjectMetadata[]
) {
  const items = projects.map(({ projectId }) => projectId);

  return new Promise<null | string>((resolve, reject) => {
    vscode.window.showQuickPick(items).then(async (projectId) => {
      const project = projects.find((p) => p.projectId === projectId);
      if (!project) {
        if (currentOptions.rc?.projects?.default) {
          // Don't show an error message if a project was previously selected,
          // just do nothing.
          resolve(null);
        }
        reject("Invalid project selected. Please select a project to proceed");
      } else {
        resolve(project.projectId);
      }
    });
  });
}

function updateCurrentUser(
  users: User[],
  broker: ExtensionBrokerImpl,
  newUserEmail?: string
) {
  if (newUserEmail) {
    if (newUserEmail === currentUserEmail) {
      return currentUserEmail;
    } else {
      currentUserEmail = newUserEmail;
    }
  }
  if (!newUserEmail) {
    if (users.length > 0) {
      currentUserEmail = users[0].email;
    } else {
      currentUserEmail = null;
    }
  }
  broker.send("notifyUserChanged", { email: currentUserEmail });
  return currentUserEmail;
}

export async function setupWorkflow(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
) {

  // Get user-defined VSCode settings.
  const workspaceConfig = workspace.getConfiguration(
    'firebase',
    vscode.workspace.workspaceFolders[0].uri
  );
  const shouldWriteDebug: boolean = workspaceConfig.get('debug');
  const debugLogPath: string = workspaceConfig.get('debugLogPath');
  const useFrameworks: boolean = workspaceConfig.get('useFrameworks');
  const npmPath: string = workspaceConfig.get('npmPath');
  if (npmPath) {
    process.env.PATH += `:${npmPath}`;
  }

  if (useFrameworks) {
    setEnabled('webframeworks', true);
  }
  /**
   * Logging setup for logging to console and to file.
   */
  // Sets up CLI logger to log to console
  process.env.DEBUG = 'true';
  setupLoggers();
  // Re-implement file logger call from ../../src/bin/firebase.ts to not bring
  // in the entire firebase.ts file
  const rootFolders = getRootFolders();
  const filePath = debugLogPath || path.join(rootFolders[0], 'firebase-plugin-debug.log');
  pluginLogger.info('Logging to path', filePath);
  // Only log to file if firebase.debug extension setting is true.
  if (shouldWriteDebug) {
    logger.add(
      new transports.File({
        level: "debug",
        filename: filePath,
        format: format.printf((info) => {
          const segments = [info.message, ...(info[SPLAT] || [])]
            .map(tryStringify);
          return `[${info.level}] ${stripAnsi(segments.join(" "))}`;
        }),
      })
    );
  }

  /**
   * Call pluginLogger with log arguments received from webview.
   */
  broker.on("writeLog", async ({ level, args }) => {
    pluginLogger[level]('(Webview)', ...args);
  });

  broker.on("getInitialData", async () => {
    // Env
    pluginLogger.debug(`Value of process.env.MONOSPACE_ENV: `
      + `${process.env.MONOSPACE_ENV}`);
    broker.send("notifyEnv", {
      env: {
        isMonospace: Boolean(process.env.MONOSPACE_ENV),
      }
    });

    // Firebase JSON and RC
    readAndSendFirebaseConfigs(broker, context);

    // User login state
    await fetchUsers();
    broker.send("notifyUsers", { users });
    currentUserEmail = updateCurrentUser(users, broker);
    if (users.length > 0) {
      await fetchChannels();
    }

    // Project
    if (currentOptions.rc?.projects?.default) {
      broker.send("notifyProjectChanged", {
        projectId: currentOptions.rc.projects.default
      });
    }
  });

  broker.on("logout", async ({ email }: { email: string }) => {
    try {
      await logoutUser(email);
      const accounts = await getAccounts();
      users = accounts.map((account) => account.user);
      broker.send("notifyUsers", { users });
      currentUserEmail = updateCurrentUser(users, broker);
    } catch (e) {
      // ignored
    }
  });

  broker.on("showMessage", async ({ msg, options }) => {
    vscode.window.showInformationMessage(msg, options);
  });

  broker.on("openLink", async ({ href }) => {
    vscode.env.openExternal(vscode.Uri.parse(href));
  });

  broker.on("addUser", async () => {
    const { user } = await login();
    users.push(user);
    if (users) {
      broker.send("notifyUsers", { users });
      currentUserEmail = updateCurrentUser(
        users,
        broker,
        user.email
      );
    }
  });

  broker.on("requestChangeUser", (
    { user: requestedUser }:
      { user: User | ServiceAccountUser }
  ) => {
    if (users.some((user) => user.email === requestedUser.email)) {
      currentUserEmail = requestedUser.email;
      broker.send("notifyUserChanged", { email: currentUserEmail });
    }
  });

  broker.on("selectProject", selectProject);

  broker.on("selectAndInitHostingFolder", selectAndInitHosting);

  broker.on("hostingDeploy", async ({ target: deployTarget }) => {
    const { success, consoleUrl, hostingUrl } = await deployToHosting(
      currentOptions.config,
      deployTarget
    );
    broker.send("notifyHostingDeploy", { success, consoleUrl, hostingUrl });
    if (success) {
      fetchChannels(true);
    }
  });

  broker.on("promptUserForInput", async () => {
    const response = await vscode.window.showInputBox({
      title: "New Preview Channel",
      prompt: "Enter a name for the new preview channel"
    });
    broker.send("notifyPreviewChannelResponse", { id: response });
  });

  context.subscriptions.push(
    setupFirebaseJsonAndRcFileSystemWatcher(broker, context)
  );

  async function fetchChannels(force = false) {
    if (force || !channels) {
      pluginLogger.debug('Fetching hosting channels');
      channels = await getChannels(currentOptions.config);
    };
    broker.send("notifyChannels", { channels });
  }

  async function selectProject({ email }) {
    let projectId;
    if (process.env.MONOSPACE_ENV) {
      pluginLogger.debug('selectProject: found MONOSPACE_ENV, '
        + 'prompting user using external flow');
      /**
       * Monospace case: use Monospace flow
       */
      const monospaceExtension =
        vscode.extensions.getExtension('google.monospace');
      process.env.MONOSPACE_DAEMON_PORT =
        monospaceExtension.exports.getMonospaceDaemonPort();
      try {
        projectId = await selectProjectInMonospace({
          projectRoot: currentOptions.cwd,
          project: undefined,
          isVSCE: true
        });
      } catch (e) {
        pluginLogger.error(e);
      }
    } else if (email === 'service_account') {
      /**
       * Non-Monospace service account case: get the service account's only
       * linked project.
       */
      pluginLogger.debug('selectProject: MONOSPACE_ENV not found, '
        + ' but service account found');
      const projects = (await listProjects()) as FirebaseProjectMetadata[];
      projectsUserMapping.set(email, projects);
      // Service accounts should only have one project.
      projectId = projects[0].projectId;
    } else {
      /**
       * Default Firebase login case, let user choose from projects that
       * Firebase login has access to.
       */
      pluginLogger.debug('selectProject: no service account or MONOSPACE_ENV '
        + 'found, using firebase account to list projects');
      let projects = [];
      if (projectsUserMapping.has(email)) {
        pluginLogger.info(`using cached projects list for ${email}`);
        projects = projectsUserMapping.get(email)!;
      } else {
        pluginLogger.info(`fetching projects list for ${email}`);
        vscode.window.showQuickPick(["Loading...."]);
        projects = (await listProjects()) as FirebaseProjectMetadata[];
        projectsUserMapping.set(email, projects);
      }
      try {
        projectId = await promptUserForProject(projects);
      } catch (e) {
        vscode.window.showErrorMessage(e.message);
      }
    }
    if (projectId) {
      await updateFirebaseRCProject(context, "default", projectId);
      broker.send("notifyProjectChanged", { projectId });
      fetchChannels(true);
    }
  }

  async function selectAndInitHosting({ projectId, singleAppSupport }) {
    pluginLogger.debug('Searching for a web framework in this project.');
      //TODO(chholland): This takes a few seconds - add some UI progress/message
    let discoveredFramework = useFrameworks && await discover(currentOptions.cwd, false);
    if (discoveredFramework) {
      pluginLogger.debug('Detected web framework, launching frameworks init.');
      await initHosting({
        spa: singleAppSupport
      });
    } else {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: `Select distribution/public folder for ${projectId}`,
        canSelectFiles: false,
        canSelectFolders: true,
      };
      const fileUri = await vscode.window.showOpenDialog(options);
      if (fileUri && fileUri[0] && fileUri[0].fsPath) {
        const publicFolderFull = fileUri[0].fsPath;
        const publicFolder = publicFolderFull.substring(
          currentOptions.cwd.length + 1
        );
        await initHosting({
          spa: singleAppSupport,
          public: publicFolder,
        });
      }
    }
    readAndSendFirebaseConfigs(broker, context);
    broker.send("notifyHostingInitDone",
      { projectId, folderPath: currentOptions.cwd });
    await fetchChannels(true);
  }
}