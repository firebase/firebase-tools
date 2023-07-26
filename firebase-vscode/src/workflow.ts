import * as vscode from "vscode";
import { ExtensionContext, workspace } from "vscode";

import { FirebaseProjectMetadata } from "../../src/types/project";
import { ExtensionBrokerImpl } from "./extension-broker";
import {
  deployToHosting,
  getAccounts,
  getChannels,
  initHosting,
  listProjects,
  login,
  logoutUser,
} from "./cli";
import { User } from "../../src/types/auth";
import { currentOptions } from "./options";
import { selectProjectInMonospace } from "../../src/monospace";
import { logSetup, pluginLogger, showOutputChannel } from "./logger-wrapper";
import { discover } from "../../src/frameworks";
import { setEnabled } from "../../src/experiments";
import {
  readAndSendFirebaseConfigs,
  setupFirebaseJsonAndRcFileSystemWatcher,
  updateFirebaseRCProject,
} from "./config-files";
import { ServiceAccountUser } from "../common/types";
import { exec, execSync } from "child_process";

let users: Array<ServiceAccountUser | User> = [];
export let currentUser: User | ServiceAccountUser;
// Stores a mapping from user email to list of projects for that user
let projectsUserMapping = new Map<string, FirebaseProjectMetadata[]>();
let channels = null;
let currentFramework: string | undefined;

async function fetchUsers() {
  const accounts = await getAccounts();
  users = accounts.map((account) => account.user);
}

/**
 * Get the user to select a project.
 */
async function promptUserForProject(projects: FirebaseProjectMetadata[]) {
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
  newUser?: User | ServiceAccountUser
) {
  const previousCurrentUser = currentUser;
  if (newUser) {
    if (newUser.email !== currentUser?.email) {
      currentUser = newUser;
    }
  }
  if (!newUser) {
    if (users.length > 0) {
      currentUser = users[0];
    } else {
      currentUser = null;
    }
  }
  broker.send("notifyUserChanged", { user: currentUser });
  if (currentUser && previousCurrentUser?.email !== currentUser.email) {
    fetchChannels(broker);
  }
  return currentUser;
}

async function fetchChannels(broker: ExtensionBrokerImpl, force = false) {
  if (force || !channels) {
    pluginLogger.debug("Fetching hosting channels");
    channels = await getChannels(currentOptions.config);
  }
  broker.send("notifyChannels", { channels });
}

export async function setupWorkflow(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
) {
  // Get user-defined VSCode settings if workspace is found.
  let shouldWriteDebug: boolean = false;
  let debugLogPath: string = "";
  let useFrameworks: boolean = false;
  let npmPath: string = "";
  if (vscode.workspace.workspaceFolders) {
    const workspaceConfig = workspace.getConfiguration(
      "firebase",
      vscode.workspace.workspaceFolders[0].uri
    );
    shouldWriteDebug = workspaceConfig.get("debug");
    debugLogPath = workspaceConfig.get("debugLogPath");
    useFrameworks = workspaceConfig.get("useFrameworks");
    npmPath = workspaceConfig.get("npmPath");
    if (npmPath) {
      process.env.PATH += `:${npmPath}`;
    }
  }

  if (useFrameworks) {
    setEnabled("webframeworks", true);
  }

  logSetup({ shouldWriteDebug, debugLogPath });

  /**
   * Call pluginLogger with log arguments received from webview.
   */
  broker.on("writeLog", async ({ level, args }) => {
    pluginLogger[level]("(Webview)", ...args);
  });

  broker.on("getInitialData", async () => {
    // Env
    pluginLogger.debug(
      `Value of process.env.MONOSPACE_ENV: ` + `${process.env.MONOSPACE_ENV}`
    );
    broker.send("notifyEnv", {
      env: {
        isMonospace: Boolean(process.env.MONOSPACE_ENV),
      },
    });

    // Firebase JSON and RC
    readAndSendFirebaseConfigs(broker, context);

    // User login state
    await fetchUsers();
    broker.send("notifyUsers", { users });
    currentUser = updateCurrentUser(users, broker, currentUser);
    if (users.length > 0) {
      await fetchChannels(broker);
    }

    // Project
    if (currentOptions.rc?.projects?.default) {
      broker.send("notifyProjectChanged", {
        projectId: currentOptions.rc.projects.default,
      });
    }
  });

  broker.on("logout", async ({ email }: { email: string }) => {
    try {
      await logoutUser(email);
      const accounts = await getAccounts();
      users = accounts.map((account) => account.user);
      broker.send("notifyUsers", { users });
      currentUser = updateCurrentUser(users, broker);
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
      currentUser = updateCurrentUser(users, broker, user);
    }
  });

  broker.on(
    "requestChangeUser",
    ({ user: requestedUser }: { user: User | ServiceAccountUser }) => {
      if (users.some((user) => user.email === requestedUser.email)) {
        currentUser = requestedUser;
        broker.send("notifyUserChanged", { user: currentUser });
      }
    }
  );

  broker.on("selectProject", selectProject);

  broker.on("chooseQuickstartDir", selectDirectory);

  broker.on("selectAndInitHostingFolder", selectAndInitHosting);

  broker.on("hostingDeploy", async ({ target: deployTarget }) => {
    showOutputChannel();
    pluginLogger.info(
      `Starting deployment of project ` +
      `${currentOptions.projectId} to channel: ${deployTarget}`
    );
    const { success, consoleUrl, hostingUrl } = await deployToHosting(
      currentOptions.config,
      deployTarget
    );
    broker.send("notifyHostingDeploy", { success, consoleUrl, hostingUrl });
    if (success) {
      fetchChannels(broker, true);
    }
  });

  broker.on("promptUserForInput", async () => {
    const response = await vscode.window.showInputBox({
      title: "New Preview Channel",
      prompt: "Enter a name for the new preview channel",
    });
    broker.send("notifyPreviewChannelResponse", { id: response });
  });

  context.subscriptions.push(
    setupFirebaseJsonAndRcFileSystemWatcher(broker, context)
  );

  async function selectProject() {
    let projectId;
    const isServiceAccount =
      (currentUser as ServiceAccountUser).type === "service_account";
    const email = currentUser.email;
    if (process.env.MONOSPACE_ENV) {
      pluginLogger.debug(
        "selectProject: found MONOSPACE_ENV, " +
        "prompting user using external flow"
      );
      /**
       * Monospace case: use Monospace flow
       */
      const monospaceExtension =
        vscode.extensions.getExtension("google.monospace");
      process.env.MONOSPACE_DAEMON_PORT =
        monospaceExtension.exports.getMonospaceDaemonPort();
      try {
        projectId = await selectProjectInMonospace({
          projectRoot: currentOptions.cwd,
          project: undefined,
          isVSCE: true,
        });
      } catch (e) {
        pluginLogger.error(e);
      }
    } else if (isServiceAccount) {
      /**
       * Non-Monospace service account case: get the service account's only
       * linked project.
       */
      pluginLogger.debug(
        "selectProject: MONOSPACE_ENV not found, " +
        " but service account found"
      );
      const projects = (await listProjects()) as FirebaseProjectMetadata[];
      projectsUserMapping.set(email, projects);
      // Service accounts should only have one project.
      projectId = projects[0].projectId;
    } else {
      /**
       * Default Firebase login case, let user choose from projects that
       * Firebase login has access to.
       */
      pluginLogger.debug(
        "selectProject: no service account or MONOSPACE_ENV " +
        "found, using firebase account to list projects"
      );
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
      fetchChannels(broker, true);
    }
  }

  async function selectAndInitHosting({ projectId, singleAppSupport }) {
    showOutputChannel();
    currentFramework = undefined;
    // Note: discover() takes a few seconds. No need to block users that don't
    // have frameworks support enabled.
    if (useFrameworks) {
      currentFramework =
        useFrameworks && (await discover(currentOptions.cwd, false));
      pluginLogger.debug("Searching for a web framework in this project.");
    }
    let success = false;
    if (currentFramework) {
      pluginLogger.debug("Detected web framework, launching frameworks init.");
      success = await initHosting({
        spa: singleAppSupport,
        useFrameworks: true,
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
        success = await initHosting({
          spa: singleAppSupport,
          public: publicFolder,
          useFrameworks: false,
        });
      }
    }
    if (success) {
      readAndSendFirebaseConfigs(broker, context);
      broker.send("notifyHostingInitDone", {
        success,
        projectId,
        folderPath: currentOptions.cwd,
        framework: currentFramework,
      });
      await fetchChannels(broker, true);
    } else {
      broker.send("notifyHostingInitDone", {
        success,
        projectId,
        folderPath: currentOptions.cwd,
      });
    }
  }

  // Opens a dialog prompting the user to select a directory.
  // @returns string file path with directory location
  async function selectDirectory() {
    const selectedURI = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });

    if (selectedURI && selectedURI[0]) {
      //const output: string = execSync("pwd").toString();
      // vscode.window.showInformationMessage(output.toString());
      console.log(
        execSync(`git clone https://github.com/firebase/quickstart-js.git && cd quickstart-js && ls | grep -xv "firestore" | xargs rm -rf && cd firestore && ls | grep -xv "angular-rewrite" | xargs rm -rf && mv -v angular-rewrite/* "${selectedURI[0].fsPath}" && cd "${selectedURI[0].fsPath}" && rm -rf quickstart-js`, {
          cwd: selectedURI[0].fsPath,
        }).toString()
      );

      vscode.commands.executeCommand(`vscode.openFolder`, selectedURI[0]);
    }
  }
}
