import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { transports, format } from "winston";
import stripAnsi from "strip-ansi";
import { SPLAT } from "triple-beam";
import { ExtensionContext, workspace } from "vscode";

import { FirebaseProjectMetadata } from "../../src/types/project";
import { writeFirebaseRCFile } from "./utils";
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
import { FirebaseRC } from "../../src/firebaserc";
import { FirebaseConfig } from "../../src/firebaseConfig";
import { currentOptions, updateOptions } from "./options";
import { ServiceAccountUser } from "./types";
import { selectProjectInMonospace } from "../../src/monospace";
import { setupLoggers, tryStringify } from "../../src/utils";
import { pluginLogger } from "./logger-wrapper";
import { logger } from '../../src/logger';

let firebaseRC: FirebaseRC | null = null;
let firebaseJSON: FirebaseConfig | null = null;
let extensionContext: ExtensionContext = null;
let users: Array<ServiceAccountUser | User> = [];
let currentUserEmail = "";
// Stores a mapping from user email to list of projects for that user
let projectsUserMapping = new Map<string, FirebaseProjectMetadata[]>();

async function fetchUsers() {
  const accounts = await getAccounts();
  users = accounts.map((account) => account.user);
}

/**
 * Get the user to select a project.
 */
async function promptUserForProject(
  broker: ExtensionBrokerImpl,
  projects: FirebaseProjectMetadata[]
) {
  const items = projects.map(({ projectId }) => projectId);

  return new Promise<null | string>((resolve, reject) => {
    vscode.window.showQuickPick(items).then(async (projectId) => {
      const project = projects.find((p) => p.projectId === projectId);
      if (!project) {
        if (firebaseRC?.projects?.default) {
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

function getRootFolders() {
  if (!workspace) {
    return [];
  }
  const folders = workspace.workspaceFolders
    ? workspace.workspaceFolders.map((wf) => wf.uri.fsPath)
    : [];
  if (workspace.workspaceFile) {
    folders.push(path.dirname(workspace.workspaceFile.fsPath));
  }
  return Array.from(new Set(folders));
}

function getConfigFile<T>(filename: string): T | null {
  const rootFolders = getRootFolders();
  for (const folder of rootFolders) {
    const jsonFilePath = path.join(folder, filename);
    if (fs.existsSync(jsonFilePath)) {
      const fileText = fs.readFileSync(jsonFilePath, "utf-8");
      try {
        const result = JSON.parse(fileText);
        currentOptions.cwd = folder;
        return result;
      } catch (e) {
        pluginLogger.error(`Error parsing JSON in ${jsonFilePath}`);
        return null;
      }
    }
  }
  // Usually there's only one root folder unless someone is using a
  // multi-root VS Code workspace.
  // https://code.visualstudio.com/docs/editor/multi-root-workspaces
  // We were trying to play it safe up above by assigning the cwd
  // based on where a .firebaserc or firebase.json was found but if
  // the user hasn't run firebase init there won't be one, and without
  // a cwd we won't know where to put it.
  //
  // TODO: prompt where we're going to save a new firebase config
  // file before we do it so the user can change it
  if (!currentOptions.cwd) {
    currentOptions.cwd = rootFolders[0];
  }
  return null;
}

export function setupWorkflow(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
) {
  extensionContext = context;

  // Get user-defined VSCode settings.
  const workspaceConfig = workspace.getConfiguration(
    'firebase',
    vscode.workspace.workspaceFolders[0].uri
  );
  const shouldDebug: boolean = workspaceConfig.get('debug');

  /**
   * Logging setup for logging to console and to file.
   */
  // Sets up CLI logger to log to console
  process.env.DEBUG = 'true';
  setupLoggers();
  // Re-implement file logger call from ../../src/bin/firebase.ts to not bring
  // in the entire firebase.ts file
  const rootFolders = getRootFolders();
  const filePath = path.join(rootFolders[0], 'firebase-plugin-debug.log');
  pluginLogger.info('Logging to path', filePath);
  // Only log to file if firebase.debug extension setting is true.
  if (shouldDebug) {
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
  // Read config files and store in memory.
  readFirebaseConfigs();
  // Check current users state
  fetchUsers();
  // Get hosting channels
  fetchChannels();

  /**
   * Call pluginLogger with log arguments received from webview.
   */
  broker.on("writeLog", async ({ level, args }) => {
    pluginLogger[level]('(Webview)', ...args);
  });

  broker.on("getEnv", async () => {
    pluginLogger.debug(`Value of process.env.MONOSPACE_ENV: `
      + `${process.env.MONOSPACE_ENV}`);
    broker.send("notifyEnv", {
      env: {
        isMonospace: Boolean(process.env.MONOSPACE_ENV),
      }
    });
  });

  broker.on("getUsers", async () => {
    if (users.length === 0) {
      await fetchUsers();
    }
    broker.send("notifyUsers", { users });
    currentUserEmail = updateCurrentUser(users, broker);
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

  broker.on("getSelectedProject", async () => {
    // For now, just read the cached value.
    // TODO: Extend this to reading from firebaserc
    if (firebaseRC?.projects?.default) {
      broker.send("notifyProjectChanged",
        { projectId: firebaseRC?.projects?.default });
    }
    fetchChannels();
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
      firebaseJSON,
      firebaseRC,
      deployTarget
    );
    broker.send("notifyHostingDeploy", { success, consoleUrl, hostingUrl });
    if (success) {
      fetchChannels();
    }
  });

  broker.on("getFirebaseJson", async () => {
    readAndSendFirebaseConfigs(broker);
  });

  context.subscriptions.push(
    setupFirebaseJsonAndRcFileSystemWatcher(broker)
  );

  async function fetchChannels() {
    const channels = await getChannels(firebaseJSON);
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
        projectId = await promptUserForProject(broker, projects);
      } catch (e) {
        vscode.window.showErrorMessage(e.message);
      }
    }
    if (projectId) {
      await updateFirebaseRC("default", projectId);
      broker.send("notifyProjectChanged", { projectId });
      fetchChannels();
    }
  }

  async function selectAndInitHosting({ projectId, singleAppSupport }) {
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
      readAndSendFirebaseConfigs(broker);
      broker.send("notifyHostingFolderReady",
        { projectId, folderPath: currentOptions.cwd });
      
      await fetchChannels();
    }
  }
}

/**
 * Parse firebase.json and .firebaserc from the configured location, if they
 * exist, and write to memory.
 */
function readFirebaseConfigs() {
  firebaseRC = getConfigFile<FirebaseRC>(".firebaserc");
  firebaseJSON = getConfigFile<FirebaseConfig>("firebase.json");

  updateOptions(extensionContext, firebaseJSON, firebaseRC);
}

/**
 *  Read Firebase configs and then send it to webviews through the given broker
 */
async function readAndSendFirebaseConfigs(broker: ExtensionBrokerImpl) {
  readFirebaseConfigs();
  broker.send("notifyFirebaseConfig",
    {
      firebaseJson: firebaseJSON, firebaseRC
    });
}

/**
 * Write new default project to .firebaserc
 */
async function updateFirebaseRC(alias: string, projectId: string) {
  if (currentOptions.cwd) {
    firebaseRC = {
      ...firebaseRC,
      projects: {
        default: firebaseRC?.projects?.default || "",
        ...(firebaseRC?.projects || {}),
        [alias]: projectId,
      },
    };
    writeFirebaseRCFile(`${currentOptions.cwd}/.firebaserc`, firebaseRC);
    updateOptions(extensionContext, firebaseJSON, firebaseRC);
  }
}

/**
 * Set up a FileSystemWatcher for .firebaserc and firebase.json Also un-watch and re-watch when the
 * configuration for where in the workspace the .firebaserc and firebase.json are.
 */
function setupFirebaseJsonAndRcFileSystemWatcher(
  broker: ExtensionBrokerImpl
): vscode.Disposable {
  // Create a new watcher
  let watcher = newWatcher();

  // Return a disposable that tears down a watcher if it's active
  return {
    dispose() {
      watcher && watcher.dispose();
    },
  };

  // HelperFunction to create a new watcher
  function newWatcher() {
    if (!currentOptions.cwd) {
      return null;
    }

    let watcher = workspace.createFileSystemWatcher(
      path.join(currentOptions.cwd, "{firebase.json,.firebaserc}")
    );
    watcher.onDidChange(async () => {
      readAndSendFirebaseConfigs(broker);
    });
    return watcher;
  }
}
