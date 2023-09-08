import vscode, { Disposable, QuickPickItem } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect, signal } from "@preact/signals-react";
import { firebaseRC } from "./config";
import { FirebaseProjectMetadata } from "../types/project";
import { currentUser } from "./user";
import { listProjects } from "../cli";
import { pluginLogger } from "../logger-wrapper";

/** Available projects */
export const projects = signal<Record<string, FirebaseProjectMetadata[]>>({});

/** Currently selected project ID */
export const currentProjectId = signal("");

/** Gets the currently selected project, fallback to first default project in RC file */
export const currentProject = computed<FirebaseProjectMetadata | undefined>(
  () => {
    const userProjects = projects.value[currentUser.value?.email ?? ""] ?? [];
    const wantProjectId =
      currentProjectId.value || firebaseRC.value.projects["default"];
    return userProjects.find((p) => p.projectId === wantProjectId);
  }
);

export function registerProject(broker: ExtensionBrokerImpl): Disposable {
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

  broker.on("getInitialData", () => {
    broker.send("notifyProjectChanged", {
      projectId: currentProject.value?.projectId ?? "",
    });
  });

  broker.on("selectProject", async () => {
    // TODO: implement at the same time we teardown the old picker
    // const projects = await listProjects();
    // const id = await promptUserForProject(projects);
    // pluginLogger.info("foo:", { id });
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

  const projectId = await vscode.window.showQuickPick(items);
  return projectId;
}
