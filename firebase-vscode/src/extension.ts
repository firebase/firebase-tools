import * as vscode from "vscode";
import { spawnSync } from "child_process";
import * as semver from "semver";

import { ExtensionBroker } from "./extension-broker";
import { createBroker } from "../common/messaging/broker";
import {
  ExtensionToWebviewParamsMap,
  WebviewToExtensionParamsMap,
} from "../common/messaging/protocol";
import { logSetup, pluginLogger } from "./logger-wrapper";
import { registerWebview } from "./webview";
import { registerCore } from "./core";
import {
  getSettings,
  setupFirebasePath,
  updateIdxSetting,
} from "./utils/settings";
import { registerFdc } from "./data-connect";
import { ExecutionParamsService } from "./data-connect/execution/execution-params";
import { AnalyticsLogger, IDX_METRIC_NOTICE } from "./analytics";
import { env } from "./core/env";

import { setIsVSCodeExtension } from "../../src/vsCodeUtils";

// This method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext) {
  const analyticsLogger = new AnalyticsLogger(context);

  await setupFirebasePath(analyticsLogger);
  const settings = getSettings();
  logSetup();
  pluginLogger.debug("Activating Firebase extension.");

  const broker = createBroker<
    ExtensionToWebviewParamsMap,
    WebviewToExtensionParamsMap,
    vscode.Webview
  >(new ExtensionBroker());

  const paramsService = new ExecutionParamsService(broker, analyticsLogger);

  // show IDX data collection notice
  if (settings.shouldShowIdxMetricNotice && env.value.isMonospace) {
    // don't await/block on this
    vscode.window.showInformationMessage(IDX_METRIC_NOTICE, "Ok").then(() => {
      updateIdxSetting(false); // don't show message again
    });
  }

  await checkCLIInstallation();

  const [emulatorsController, coreDisposable] = await registerCore(
    broker,
    context,
    analyticsLogger,
  );

  context.subscriptions.push(
    { dispose: analyticsLogger.endSession },
    { dispose: analyticsLogger.onDispose },
    coreDisposable,
    registerWebview({
      name: "fdc_sidebar",
      broker,
      context,
    }),
    paramsService,
    registerFdc(
      context,
      broker,
      paramsService,
      emulatorsController,
      analyticsLogger,
    ),
  );
}

async function checkCLIInstallation(): Promise<void> {
  // This should never error out - it must be best effort.
  let message = "";
  try {
    // Fetch directly so that we don't need to rely on any tools being presnt on path.
    const latestVersionRes = await fetch(
      "https://registry.npmjs.org/firebase-tools",
    );
    const latestVersion = (await latestVersionRes.json())?.["dist-tags"]?.[
      "latest"
    ];
    setIsVSCodeExtension(true);
    const env = { ...process.env, VSCODE_CWD: "" };

    // On macOS/Linux, run commands through a login shell to load user profile environments (NVM, Homebrew, etc.)
    const isWin = process.platform === "win32";
    const shell = process.env.SHELL || "/bin/bash";
    const spawnOptions = isWin ? { env, shell: true } : { env };

    const runCommand = (cmd: string) => {
      if (isWin) {
        return spawnSync(cmd, spawnOptions);
      }
      return spawnSync(shell, ["-l", "-c", cmd], spawnOptions);
    };

    const versionRes = runCommand("firebase --version");
    const versionStdout = versionRes.status === 0 ? versionRes.stdout?.toString().trim() : "";
    const currentVersion = versionStdout
      ? (semver.valid(versionStdout) || semver.coerce(versionStdout)?.version)
      : undefined;

    const npmVersionRes = runCommand("npm --version");
    const npmStdout = npmVersionRes.status === 0 ? npmVersionRes.stdout?.toString().trim() : "";
    const npmVersion = npmStdout
      ? (semver.valid(npmStdout) || semver.coerce(npmStdout)?.version)
      : undefined;

    if (!currentVersion) {
      message = `The Firebase CLI is not installed (or not available on $PATH). If you would like to install it, run ${
        npmVersion
          ? "npm install -g firebase-tools"
          : "curl -sL https://firebase.tools | bash"
      }`;
    } else if (latestVersion && semver.lt(currentVersion, latestVersion)) {
      let installCommand =
        "curl -sL https://firebase.tools | upgrade=true bash";
      if (npmVersion) {
        // Despite the presence of npm, the existing command may be standalone.
        // Run a special standalone-specific command to tell if it actually is.
        const checkRes = runCommand("firebase --tool:setup-check");
        if (checkRes.status !== 0) {
          installCommand = "npm install -g firebase-tools@latest";
        }
      }
      message = `There is an outdated version of the Firebase CLI installed on your system. We recommened updating to the latest verion by running ${installCommand}`;
    } else {
      pluginLogger.info(`Checked firebase-tools, is up to date!`);
    }
  } catch (err: any) {
    pluginLogger.info(`Unable to check firebase-tools installation: ${err}`);
  }

  if (message) {
    vscode.window.showWarningMessage(message);
  }
}
