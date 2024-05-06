import vscode, { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../extension-broker";
import { effect } from "@preact/signals-react";
import { ChannelWithId } from "../messaging/types";
import { deployToHosting, getChannels, initHosting } from "../cli";
import { firebaseConfig } from "../core/config";
import { pluginLogger, showOutputChannel } from "../logger-wrapper";
import { currentOptions } from "../options";
import { currentProject } from "../core/project";
import { getSettings } from "../utils/settings";
import { discover } from "../../../src/frameworks";
import { globalSignal } from "../utils/globals";
import { ResultValue } from "../result";
import { firstWhereDefined } from "../utils/signal";

const channels = globalSignal<ChannelWithId[]>([]);

export function registerHosting(broker: ExtensionBrokerImpl): Disposable {
  // Refresh channels when project changes
  const sub1 = effect(async () => {
    if (currentProject.value) {
      pluginLogger.info("(Hosting) New project detected, fetching channels");
      const config = firebaseConfig.peek();

      channels.value =
        config instanceof ResultValue ? await getChannels(config.value) : [];
    }
  });

  const sub2 = effect(() => {
    pluginLogger.info("(Hosting) New channels loaded", channels.value);
    broker.send("notifyChannels", { channels: channels.value });
  });

  const sub3 = broker.on(
    "selectAndInitHostingFolder",
    async ({ singleAppSupport }) => {
      const configs = await firstWhereDefined(firebaseConfig).then(
        (c) => c.requireValue
      );

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
        channels.value = await getChannels(configs);
      }
    }
  );

  const sub4 = broker.on("hostingDeploy", async ({ target: deployTarget }) => {
    const configs = await firstWhereDefined(firebaseConfig).then(
      (c) => c.requireValue
    );
    showOutputChannel();

    pluginLogger.info(
      `(Hosting) Starting deployment of project ` +
        `${currentProject.value?.projectId} to channel: ${deployTarget}`
    );

    const deployResponse = await deployToHosting(configs, deployTarget);

    if (deployResponse.success) {
      pluginLogger.info("(Hosting) Refreshing channels");
      channels.value = await getChannels(configs);
    }

    broker.send("notifyHostingDeploy", deployResponse);
  });

  // TODO: this should be either more specific OR we should pass the title and prompt via the generic message
  const sub5 = broker.on("promptUserForInput", async () => {
    const response = await vscode.window.showInputBox({
      title: "New Preview Channel",
      prompt: "Enter a name for the new preview channel",
    });
    broker.send("notifyPreviewChannelResponse", { id: response });
  });

  return Disposable.from(
    { dispose: sub1 },
    { dispose: sub2 },
    { dispose: sub3 },
    { dispose: sub4 },
    { dispose: sub5 }
  );
}
