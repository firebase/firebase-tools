import vscode, { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect } from "@preact/signals-react";
import { firebaseRC, updateFirebaseRCProject } from "./config";
import { FirebaseProjectMetadata } from "../types/project";
import { currentUser, isServiceAccount } from "./user";
import { listProjects } from "../cli";
import { pluginLogger } from "../logger-wrapper";
import { globalSignal } from "../utils/globals";
import { firstWhereDefined } from "../utils/signal";
import { User } from "../types/auth";
/** Available projects */
export const projects = globalSignal<Record<string, FirebaseProjectMetadata[]>>(
  {},
);

/** Currently selected project ID */
export const currentProjectId = globalSignal("");

const userScopedProjects = computed<FirebaseProjectMetadata[] | undefined>(
  () => {
    return projects.value[currentUser.value?.email ?? ""];
  },
);

export function registerProject(broker: ExtensionBrokerImpl): Disposable {
  async function fetchNewProjects(user: User) {
    const userProjects = await listProjects();
    projects.value = {
      ...projects.value,
      [user.email]: userProjects,
    };
  }

  const sub1 = effect(() => {
    const user = currentUser.value;
    if (user) {
      pluginLogger.info("(Core:Project) New user detected, fetching projects");
      fetchNewProjects(user);
    }
  });

  const sub2 = effect(() => {
    broker.send("notifyProjectChanged", {
      projectId: currentProjectId.value ?? "",
    });
  });

  // Update .firebaserc with defined project ID
  const sub3 = effect(() => {
    const projectId = currentProjectId.value;
    if (projectId) {
      updateFirebaseRCProject({
        projectAlias: { alias: "default", projectId },
      });
    }
  });

  // Initialize currentProjectId to default project ID
  const sub4 = effect(() => {
    if (!currentProjectId.value) {
      currentProjectId.value = firebaseRC.value?.tryReadValue?.projects.default;
    }
  });

  const sub5 = broker.on("getInitialData", () => {
    let wantProjectId =
      currentProjectId.value ||
      firebaseRC.value?.tryReadValue?.projects["default"];
    // Service accounts should only have one project
    if (isServiceAccount.value) {
      wantProjectId = userScopedProjects.value?.[0].projectId;
    }

    broker.send("notifyProjectChanged", {
      projectId: wantProjectId ?? "",
    });
  });

  // TODO: In IDX, should we just client.GetProject() from the metadata server?
  // Should we instead hide this command entirely?
  const command = vscode.commands.registerCommand(
    "firebase.selectProject",
    async () => {
      if (isServiceAccount.value) {
        return;
      } else {
        try {
          const projects = firstWhereDefined(userScopedProjects);

          currentProjectId.value =
            (await _promptUserForProject(projects)) ?? currentProjectId.value;
        } catch (e) {
          vscode.window.showErrorMessage(e.message);
        }
      }
    },
  );

  const sub6 = broker.on("selectProject", () =>
    vscode.commands.executeCommand("firebase.selectProject"),
  );

  return vscode.Disposable.from(
    command,
    { dispose: sub1 },
    { dispose: sub2 },
    { dispose: sub3 },
    { dispose: sub4 },
    { dispose: sub5 },
    { dispose: sub6 },
  );
}

/**
 * Get the user to select a project
 *
 * @internal
 */
export async function _promptUserForProject(
  projects: Thenable<FirebaseProjectMetadata[]>,
  token?: vscode.CancellationToken,
): Promise<string | undefined> {
  const items = projects.then((projects) => {
    return projects.map((p) => ({
      label: p.projectId,
      description: p.displayName,
    }));
  });

  const item = await vscode.window.showQuickPick(items, {}, token);
  return item?.label;
}
