import vscode, { Disposable, ExtensionContext, QuickPickItem } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect } from "@preact/signals-react";
import { firebaseRC } from "./config";
import { FirebaseProjectMetadata } from "../types/project";
import { currentUser, isServiceAccount } from "./user";
import { listProjects } from "../cli";
import { pluginLogger } from "../logger-wrapper";
import { selectProjectInMonospace } from "../../../src/monospace";
import { currentOptions } from "../options";
import { updateFirebaseRCProject } from "../config-files";
import { globalSignal } from "../utils/globals";
import { firstWhereDefined } from "../utils/signal";

/** Available projects */
export const projects = globalSignal<Record<string, FirebaseProjectMetadata[]>>(
  {}
);

/** Currently selected project ID */
export const currentProjectId = globalSignal("");

const userScopedProjects = computed<FirebaseProjectMetadata[] | undefined>(
  () => {
    return projects.value[currentUser.value?.email ?? ""];
  }
);

/** Gets the currently selected project, fallback to first default project in RC file */
export const currentProject = computed<FirebaseProjectMetadata | undefined>(
  () => {
    // Service accounts should only have one project
    if (isServiceAccount.value) {
      return userScopedProjects.value?.[0];
    }

    const wantProjectId =
      currentProjectId.value || firebaseRC.value?.projects["default"];
    return userScopedProjects.value?.find((p) => p.projectId === wantProjectId);
  }
);

export function registerProject({
  context,
  broker,
}: {
  context: ExtensionContext;
  broker: ExtensionBrokerImpl;
}): Disposable {
  effect(async () => {
    const user = currentUser.value;
    if (user) {
      pluginLogger.info("(Core:Project) New user detected, fetching projects");
      const userProjects = await listProjects();
      projects.value = {
        ...projects.value,
        [user.email]: userProjects,
      };
    }
  });

  effect(() => {
    broker.send("notifyProjectChanged", {
      projectId: currentProject.value?.projectId ?? "",
    });
  });

  // Update .firebaserc with defined project ID
  effect(() => {
    const projectId = currentProjectId.value;
    if (projectId) {
      updateFirebaseRCProject(context, "default", currentProjectId.value);
    }
  });

  broker.on("getInitialData", () => {
    broker.send("notifyProjectChanged", {
      projectId: currentProject.value?.projectId ?? "",
    });
  });

  const command = vscode.commands.registerCommand(
    "firebase.selectProject",
    async () => {
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
          const projectId = await selectProjectInMonospace({
            projectRoot: currentOptions.value.cwd,
            project: undefined,
            isVSCE: true,
          });

          if (projectId) {
            currentProjectId.value = projectId;
          }
        } catch (e) {
          pluginLogger.error(e);
        }
      } else if (isServiceAccount.value) {
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
    }
  );

  broker.on("selectProject", () =>
    vscode.commands.executeCommand("firebase.selectProject")
  );

  return vscode.Disposable.from(command);
}

/**
 * Get the user to select a project
 *
 * @internal
 */
export async function _promptUserForProject(
  projects: Thenable<FirebaseProjectMetadata[]>,
  token?: vscode.CancellationToken
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
