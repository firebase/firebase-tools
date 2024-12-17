import * as vscode from "vscode";
import { spawnSync } from "child_process";
import * as semver from "semver";
import * as path from "path";

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
import { AuthService } from "./auth/service";
import { AnalyticsLogger, IDX_METRIC_NOTICE } from "./analytics";
import { env } from "./core/env";

import { suggestGraphqlSyntaxExtension } from "./data-connect/graphql-syntax-highlighter";
import { registerSession } from "./session";
import { computed, ReadonlySignal, Signal, signal } from "@preact/signals-core";
import { checkLogin, User } from "./core/user";
import { requireAuthWrapper } from "./cli";
import { _readRC, getConfigPath } from "./core/config";
import { RC } from "../src/rc";
import { Result, ResultValue } from "./result";
import { Emulators, registerEmulators } from "./emulators";

// This method is called when your extension is activated
export async function activate(ctx: vscode.ExtensionContext) {
  await setupFirebasePath();
  const settings = getSettings();

  logSetup();
  pluginLogger.debug("Activating Firebase extension.");

  await checkCLIInstallation();

  const user = await createUser();
  const rc = await createRC(ctx);
  const project = await createProject(rc);
  const emulators = signal<Emulators>({ status: "stopped" });

  ctx.subscriptions.push(
    registerEmulators(emulators, rc),
    registerSession(user, project),
  );
}

async function createUser(): Promise<Signal<User | undefined>> {
  const user = await requireAuthWrapper();
  return signal(user ?? undefined);
}

async function createRC(
  ctx: vscode.ExtensionContext,
): Promise<Signal<Result<RC | undefined>>> {
  // const folderPath = path.dirname(getConfigPath() ?? "");
  const rcUri = vscode.Uri.file(
    path.join(getConfigPath() ?? "", ".firebaserc"),
  );
  console.log("WOWOWOWOWOW");
  console.log(rcUri.fsPath);
  const watcher = vscode.workspace.createFileSystemWatcher(rcUri.fsPath);
  ctx.subscriptions.push(watcher);

  const rc = signal<Result<RC | undefined>>(_readRC(rcUri));
  watcher.onDidChange(() => (rc.value = _readRC(rcUri)));
  watcher.onDidCreate(() => (rc.value = _readRC(rcUri)));
  watcher.onDidDelete(() => (rc.value = new ResultValue(undefined)));

  return rc;
}

async function createProject(
  rc: Signal<Result<RC | undefined>>,
): Promise<ReadonlySignal<string | undefined>> {
  return computed(() => {
    if (rc.value.tryReadValue) {
      return rc.value.tryReadValue.projects.default;
    }
  });
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
    const env = { ...process.env, VSCODE_CWD: "" };
    const versionRes = spawnSync("firebase", ["--version"], {
      env,
      shell: process.platform === "win32",
    });
    const currentVersion = semver.valid(versionRes.stdout?.toString());
    const npmVersionRes = spawnSync("npm", ["--version"], {
      env,
      shell: process.platform === "win32",
    });
    const npmVersion = semver.valid(npmVersionRes.stdout?.toString());
    if (!currentVersion) {
      message = `The Firebase CLI is not installed (or not available on $PATH). If you would like to install it, run ${
        npmVersion
          ? "npm install -g firebase-tools"
          : "curl -sL https://firebase.tools | bash"
      }`;
    } else if (semver.lt(currentVersion, latestVersion)) {
      let installCommand =
        "curl -sL https://firebase.tools | upgrade=true bash";
      if (npmVersion) {
        // Despite the presence of npm, the existing command may be standalone.
        // Run a special standalone-specific command to tell if it actually is.
        const checkRes = spawnSync("firebase", ["--tool:setup-check"], { env });
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
