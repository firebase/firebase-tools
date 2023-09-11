import vscode, { Disposable, ExtensionContext, QuickPickItem } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect, signal } from "@preact/signals-react";
import { firebaseRC } from "./config";
import { FirebaseProjectMetadata } from "../types/project";
import { currentUser, isServiceAccount } from "./user";
import { listProjects } from "../cli";
import { pluginLogger } from "../logger-wrapper";
import { selectProjectInMonospace } from "../../../src/monospace";
import { currentOptions } from "../options";
import { updateFirebaseRCProject } from "../config-files";

/** Available projects */
export const projects = signal<Record<string, FirebaseProjectMetadata[]>>({});

/** Currently selected project ID */
export const currentProjectId = signal("");

const userScopedProjects = computed(() => {
  return projects.value[currentUser.value?.email ?? ""] ?? [];
});

/** Gets the currently selected project, fallback to first default project in RC file */
export const currentProject = computed<FirebaseProjectMetadata | undefined>(
  () => {
    // Service accounts should only have one project
    if (isServiceAccount.value) {
      return userScopedProjects.value[0];
    }

    const wantProjectId =
      currentProjectId.value || firebaseRC.value.projects["default"];
    return userScopedProjects.value.find((p) => p.projectId === wantProjectId);
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

  broker.on("selectProject", async () => {
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
          projectRoot: currentOptions.cwd,
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
        currentProjectId.value = await promptUserForProject(
          userScopedProjects.value
        );
      } catch (e) {
        vscode.window.showErrorMessage(e.message);
      }
    }
  });

  return {
    dispose() {},
  };
}

/** Get the user to select a project */
async function promptUserForProject(projects: FirebaseProjectMetadata[]) {
  const items: QuickPickItem[] = projects.map((p) => ({
    label: p.projectId,
    description: p.displayName,
  }));

  const item = await vscode.window.showQuickPick(items);
  return item.label;
}
