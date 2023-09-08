import * as vscode from "vscode";
import { ExtensionContext } from "vscode";

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
import { pluginLogger } from "./logger-wrapper";
import {
  readAndSendFirebaseConfigs,
  setupFirebaseJsonAndRcFileSystemWatcher,
  updateFirebaseRCProject,
} from "./config-files";
import { ServiceAccountUser } from "../common/types";

let users: Array<ServiceAccountUser | User> = [];
export let currentUser: User | ServiceAccountUser;
// Stores a mapping from user email to list of projects for that user
let projectsUserMapping = new Map<string, FirebaseProjectMetadata[]>();

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
  return currentUser;
}

export async function setupWorkflow(
  context: ExtensionContext,
  broker: ExtensionBrokerImpl
) {
  broker.on("getInitialData", async () => {
    // Firebase JSON and RC
    readAndSendFirebaseConfigs(broker, context);

    // User login state
    await fetchUsers();
    broker.send("notifyUsers", { users });
    currentUser = updateCurrentUser(users, broker, currentUser);

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
    }
  }
}
