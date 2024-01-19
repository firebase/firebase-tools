import vscode, { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { effect } from "@preact/signals-react";
import { ChannelWithId } from "../messaging/types";
import { deployToHosting, getChannels, initHosting } from "../cli";
import { firebaseConfig } from "../core/config";
import { pluginLogger, showOutputChannel } from "../logger-wrapper";
import { currentOptions } from "../options";
import { currentProject, currentProjectId } from "../core/project";
import { getSettings } from "../utils/settings";
import { discover } from "../../../src/frameworks";
import { globalSignal } from "../utils/globals";

const channels = globalSignal<ChannelWithId[]>([]);

export function registerHosting(broker: ExtensionBrokerImpl): Disposable {
  // Refresh channels when project changes
  effect(async () => {
    if (currentProject.value) {
      pluginLogger.info("(Hosting) New project detected, fetching channels");
      channels.value = await getChannels(firebaseConfig.peek());
    }
  });

  effect(() => {
    pluginLogger.info("(Hosting) New channels loaded", channels.value);
    broker.send("notifyChannels", { channels: channels.value });
  });

  broker.on("selectAndInitHostingFolder", async ({ singleAppSupport }) => {
    showOutputChannel();

    let currentFramework: string | undefined = undefined;
    // Note: discover() takes a few seconds. No need to block users that don't
    // have frameworks support enabled.
    const { useFrameworks } = getSettings();
    if (useFrameworks) {
      currentFramework = await discover(currentOptions.value.cwd, false);
      pluginLogger.debug(
        "(Hosting) Searching for a web framework in this project."
      );
    }

    let success = false;
    if (currentFramework) {
      pluginLogger.debug(
        "(Hosting) Detected web framework, launching frameworks init."
      );
      success = await initHosting({
        spa: singleAppSupport,
        useFrameworks: true,
      });
    } else {
      const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        openLabel: `Select distribution/public folder for ${currentProject.value?.projectId}`,
        canSelectFiles: false,
        canSelectFolders: true,
      };
      const fileUri = await vscode.window.showOpenDialog(options);
      if (fileUri && fileUri[0] && fileUri[0].fsPath) {
        const publicFolderFull = fileUri[0].fsPath;
        const publicFolder = publicFolderFull.substring(
          currentOptions.value.cwd.length + 1
        );
        success = await initHosting({
          spa: singleAppSupport,
          public: publicFolder,
          useFrameworks: false,
        });
      }
    }

    broker.send("notifyHostingInitDone", {
      success,
      projectId: currentProject.value?.projectId,
      folderPath: currentOptions.value.cwd,
      framework: currentFramework,
    });

    if (success) {
      channels.value = await getChannels(firebaseConfig.value);
    }
  });

  broker.on("hostingDeploy", async ({ target: deployTarget }) => {
    showOutputChannel();

    pluginLogger.info(
      `(Hosting) Starting deployment of project ` +
        `${currentProject.value?.projectId} to channel: ${deployTarget}`
    );

    const deployResponse = await deployToHosting(
      firebaseConfig.value,
      deployTarget
    );

    if (deployResponse.success) {
      pluginLogger.info("(Hosting) Refreshing channels");
      channels.value = await getChannels(firebaseConfig.value);
    }

    broker.send("notifyHostingDeploy", deployResponse);
  });

  // TODO: this should be either more specific OR we should pass the title and prompt via the generic message
  broker.on("promptUserForInput", async () => {
    const response = await vscode.window.showInputBox({
      title: "New Preview Channel",
      prompt: "Enter a name for the new preview channel",
    });
    broker.send("notifyPreviewChannelResponse", { id: response });
  });

  return { dispose() {} };
}
