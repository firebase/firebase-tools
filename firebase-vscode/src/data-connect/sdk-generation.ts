import * as vscode from "vscode";
import { Uri } from "vscode";
import { firstWhere, firstWhereDefined } from "../utils/signal";
import { currentOptions } from "../options";
import { dataConnectConfigs, ResolvedConnectorYaml } from "./config";
import { runCommand, setTerminalEnvVars } from "./terminal";
import { ExtensionBrokerImpl } from "../extension-broker";
import { DATA_CONNECT_EVENT_NAME } from "../analytics";
import { getSettings } from "../utils/settings";
import { FDC_APP_FOLDER, } from "../../../src/init/features/dataconnect/sdk";
import { createE2eMockable } from "../utils/test_hooks";
import { AnalyticsLogger} from "../analytics";

export function registerFdcSdkGeneration(
  broker: ExtensionBrokerImpl,
  analyticsLogger: AnalyticsLogger,
): vscode.Disposable {
  const settings = getSettings();

  // For testing purposes.
  const selectFolderSpy = createE2eMockable(
    async () => {
      return selectAppFolder();
    },
    "select-folder",
    async () => {
      return Promise.resolve("src/test/test_projects/fishfood/test-node-app");
    },
  );

  const initSdkCmd = vscode.commands.registerCommand(
    "fdc.init-sdk",
    (args: { appFolder: string }) => {
      analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.INIT_SDK_CLI);
      // Lets do it from the right directory
      const e: Record<string, string> = {}
      e[FDC_APP_FOLDER] = args.appFolder;
      setTerminalEnvVars(e);
      runCommand(`${settings.firebasePath} init dataconnect:sdk`);
    },
  );

  // codelense from inside connector.yaml file
  const configureSDKCodelense = vscode.commands.registerCommand(
    "fdc.connector.configure-sdk",
    async () => {
      analyticsLogger.logger.logUsage(
        DATA_CONNECT_EVENT_NAME.INIT_SDK_CODELENSE,
      );
      await selectAppFolderAndRunInitSdk();
    },
  );

  // Sidebar "configure generated sdk" button
  const configureSDK = vscode.commands.registerCommand(
    "fdc.configure-sdk",
    async () => {
      analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.INIT_SDK);
      await selectAppFolderAndRunInitSdk();
    },
  );

  async function selectAppFolderAndRunInitSdk() {
    const appFolder = await selectFolderSpy.call();
    if (appFolder) {
      await runInitSdk(appFolder);
    }
  }

  async function selectAppFolder() {
    // confirmation prompt for selecting app folder; skip if configured to skip
    const configs = vscode.workspace.getConfiguration("firebase.dataConnect");
    const skipToAppFolderSelect = "skipToAppFolderSelect";
    if (!configs.get(skipToAppFolderSelect)) {
      const result = await vscode.window.showInformationMessage(
        "Please select your app folder to generate an SDK for.",
        { modal: !process.env.VSCODE_TEST_MODE },
        "Yes",
        "Don't show again",
      );
      if (result !== "Yes" && result !== "Don't show again") {
        return;
      }
      if (result === "Don't show again") {
        configs.update(
          skipToAppFolderSelect,
          true,
          vscode.ConfigurationTarget.Global,
        );
      }
    }

    // open app folder selector
    const folderUris: Uri[] | undefined = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      title: "Select your app folder to link Data Connect to:",
      openLabel: "Select app folder",
    });
    if (!folderUris?.length) {
      return;
    }
    return folderUris[0].fsPath; // can only pick one folder, but return type is an array
  }

  async function runInitSdk(appFolder: string) {
    vscode.commands.executeCommand("fdc.init-sdk", { appFolder });
  }

  const configureSDKSub = broker.on("fdc.configure-sdk", async () =>
    vscode.commands.executeCommand("fdc.configure-sdk"),
  );
  return vscode.Disposable.from(
    initSdkCmd,
    configureSDK,
    configureSDKCodelense,
    {
      dispose: configureSDKSub,
    },
  );
}

async function pickService(serviceIds: string[]): Promise<string | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return serviceIds.map((serviceId) => {
      return {
        label: serviceId,
        options,
        picked: true,
      };
    });
  });

  const picked = await vscode.window.showQuickPick<{ label: string }>(options, {
    title: "Select service",
    canPickMany: false,
  });
  return picked?.label;
}

async function pickConnector(
  connectorIds: string[] | undefined,
): Promise<string | undefined> {
  const options = firstWhere(
    currentOptions,
    (options) => options.project?.length !== 0,
  ).then((options) => {
    return connectorIds?.map((connectorId) => {
      return {
        label: connectorId,
        options,
        picked: true,
      };
    });
  });

  const picked = await vscode.window.showQuickPick<{ label: string }>(
    options as any,
    {
      title: `Select connector to generate SDK for.`,
      canPickMany: false,
    },
  );

  return picked?.label;
}
