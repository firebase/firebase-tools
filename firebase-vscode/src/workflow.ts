import * as path from "path";
import * as vscode from "vscode";
import { ExtensionContext, workspace } from "vscode";
import { FirebaseProjectMetadata } from "../../src/types/project";
import {
  parseFirebaseJSONFile,
  parseFirebaseRCFile,
  writeFirebaseRCFile,
} from "./utils";
import { ExtensionBrokerImpl } from "./extension-broker";
import { getUsers, listProjects, login, logoutUser } from "./cli";
import { User } from "../../src/types/auth";

export const firebaseRcFolderSetting =
  "firebase-vscode-extension.firebaseRcFolder";

function processCurrentUser(
  currentUserEmail: string,
  users: User[],
  broker: ExtensionBrokerImpl
) {
  if (!currentUserEmail && users.length > 0) {
    currentUserEmail = users[0].email;
  }
  broker.send("notifyUserChanged", currentUserEmail);
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

export function setupWorkflow(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
) {
  let users: User[] = [];
  let currentUserEmail = "";
  let selectedProject: FirebaseProjectMetadata | null = null;
  // Stores a mapping from user email to list of projects for that user
  let projectsUserMapping = new Map<string, FirebaseProjectMetadata[]>();

  broker.on("getUsers", async () => {
    if (users.length === 0) {
      const accounts = await getUsers();
      users = accounts.map(account => account.user);
    }
    broker.send("notifyUsers", users);
    currentUserEmail = processCurrentUser(currentUserEmail, users, broker);
  });

  broker.on("logout", async (email: string) => {
    const res = await logoutUser(email);
    if (res) {
      users = [];
      broker.send("notifyUsers", users);
    }
  });

  broker.on("getSelectedProject", async () => {
    // For now, just read the cached value.
    // TODO: Extend this to reading from firebaserc
    if (selectedProject) {
      broker.send("notifyProjectChanged", selectedProject);
    }
  });

  broker.on("projectPicker", async (projects: FirebaseProjectMetadata[]) => {
    const items = projects.map(({ projectId }) => projectId);
    vscode.window.showQuickPick(items).then(async (projectId) => {
      const project = projects.find((p) => p.projectId === projectId);
      if (!project) {
        vscode.window.showErrorMessage(
          "Invalid project selected. Please select a project to proceed"
        );
      } else {
        selectedProject = project;
        await updateFirebaseRC("default", project.projectId);
        broker.send("notifyProjectChanged", project);
      }
    });
  });

  broker.on("showMessage", async (msg) => {
    vscode.window.showInformationMessage(msg);
  });

  broker.on("addUser", async () => {
    const { user } = await login();
    users.push(user as User);
    if (users) {
      broker.send("notifyUsers", users);
      currentUserEmail = processCurrentUser(currentUserEmail, users, broker);
    }
  });

  broker.on("requestChangeUser", (email: string) => {
    if (users.some((user) => user.email === email)) {
      currentUserEmail = email;
      broker.send("notifyUserChanged", currentUserEmail);
    }
  });

  broker.on("getProjects", async (email) => {
    if (projectsUserMapping.has(email)) {
      console.log(`using cached projects list for ${email}`);
      const projects = projectsUserMapping.get(email)!;
      broker.send("notifyProjects", email, projects);
    } else {
      console.log(`fetching projects list for ${email}`);
      vscode.window.showQuickPick(["Loading...."]);
      const projects = (await listProjects()) as FirebaseProjectMetadata[];
      projectsUserMapping.set(email, projects);
      broker.send("notifyProjects", email, projects);
    }
  });

  // broker.on(
  //   "selectAndInitHostingFolder",
  //   async (projectId: string, email: string, singleAppSupport: boolean) => {
  //     const options: vscode.OpenDialogOptions = {
  //       canSelectMany: false,
  //       openLabel: `Select distribution/public folder for ${projectId}`,
  //       canSelectFiles: false,
  //       canSelectFolders: true,
  //     };
  //     const fileUri = await vscode.window.showOpenDialog(options);
  //     if (fileUri && fileUri[0] && fileUri[0].fsPath) {
  //       const publicFolderFull = fileUri[0].fsPath;
  //       const publicFolderParent = path.dirname(publicFolderFull);
  //       const rootFolders = getRootFolders();
  //       const commonFolder = rootFolders.find((f) =>
  //         publicFolderParent.startsWith(f)
  //       );
  //       const firebaseRCfolder = commonFolder
  //         ? commonFolder
  //         : publicFolderParent;
  //       const publicFolder = publicFolderFull.substring(
  //         firebaseRCfolder.length + 1
  //       );

  //       // TODO: Store firebaseRCfolder in configuration.
  //       // getConfiguration('myExt.setting').get('doIt') === true.
  //       await workspace
  //         .getConfiguration()
  //         .update(
  //           firebaseRcFolderSetting,
  //           firebaseRCfolder,
  //           /* target = false means workspace setting*/ false
  //         );

  //       const {} = await cli.initHostingAsync(
  //         { cwd: firebaseRCfolder, projectId, email },
  //         { singleAppSupport, publicFolder }
  //       );

  //       broker.send("notifyHostingFolderReady", projectId, firebaseRCfolder);
  //     }
  //   }
  // );

  // broker.on("hostingDeploy", async () => {
  //   // TODO: use configuraiton saved directory with .firebaserc
  //   const rootFolders = getRootFolders();
  //   const { success, consoleUrl, hostingUrl } = await cli.deployHostingAsync(
  //     rootFolders[0]
  //   );
  //   broker.send("notifyHostingDeploy", success, consoleUrl, hostingUrl);
  // });

  broker.on("getWorkspaceFolders", () => {
    broker.send("notifyWorkspaceFolders", getRootFolders());
  });

  broker.on("getFirebaseJson", async () => {
    parseAndSendFirebaseJson(broker);
  });

  context.subscriptions.push(
    setupFirebaseJsonAndRcFileSystemWatcher(context, broker)
  );
}

/**
 * Parse firebase.json and .firebaserc from the configured location, if they
 * exist, and then send it to webviews through the given broker
 */
async function parseAndSendFirebaseJson(broker: ExtensionBrokerImpl) {
  const firebaseRcFolder = workspace
    .getConfiguration()
    .get<string>(firebaseRcFolderSetting);
  if (firebaseRcFolder) {
    broker.send(
      "notifyFirebaseJson",
      await parseFirebaseJSONFile(path.join(firebaseRcFolder, "firebase.json")),
      await parseFirebaseRCFile(path.join(firebaseRcFolder, ".firebaserc"))
    );
  } else {
    broker.send("notifyFirebaseJson", {}, {});
  }
}

/**
 * Parse firebase.json and .firebaserc from the configured location, if they
 * exist, and then send it to webviews through the given broker
 */
async function updateFirebaseRC(alias: string, projectId: string) {
  const firebaseRcFolder = workspace
    .getConfiguration()
    .get<string>(firebaseRcFolderSetting);
  if (firebaseRcFolder) {
    let firebaseRcPath = path.join(firebaseRcFolder, ".firebaserc");
    let rc = await parseFirebaseRCFile(firebaseRcPath);
    rc = {
      ...rc,
      projects: {
        default: rc.projects?.default || "", // ensure default no matter what
        ...(rc.projects || {}),
        [alias]: projectId,
      },
    };
    writeFirebaseRCFile(firebaseRcPath, rc);
  }
}

/**
 * Set up a FileSystemWatcher for .firebaserc and firebase.json Also un-watch and re-watch when the
 * configuration for where in the workspace the .firebaserc and firebase.json are.
 */
function setupFirebaseJsonAndRcFileSystemWatcher(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
): vscode.Disposable {
  // Create a new watcher
  let watcher = newWatcher();

  // Teardown and create a new watcher if the configuration changes
  workspace.onDidChangeConfiguration((e) => {
    if (!e.affectsConfiguration(firebaseRcFolderSetting)) {
      return;
    }

    watcher && watcher.dispose();
    watcher = newWatcher();
  });

  // Return a disposable that tears down a watcher if it's active
  return {
    dispose() {
      watcher && watcher.dispose();
    },
  };

  // HelperFunction to create a new watcher
  function newWatcher() {
    const firebaseRcFolder = workspace
      .getConfiguration()
      .get<string>(firebaseRcFolderSetting);
    if (!firebaseRcFolder) {
      return null;
    }

    let watcher = workspace.createFileSystemWatcher(
      path.join(firebaseRcFolder, "{firebase.json,.firebaserc}")
    );
    watcher.onDidChange(async () => {
      parseAndSendFirebaseJson(broker);
    });
    return watcher;
  }
}
