import vscode, { Disposable } from "vscode";
import {
  emulatorsStart,
  getEmulatorUiUrl,
  listRunningEmulators,
  stopEmulators,
  getEmulatorDetails,
  Emulators,
} from "../cli";
import { ExtensionBrokerImpl } from "../extension-broker";
import { computed, effect, signal } from "@preact/signals-core";
import {
  DEFAULT_EMULATOR_UI_SELECTIONS,
  ExtensionToWebviewParamsMap,
} from "../../common/messaging/protocol";
import { firebaseRC } from "./config";
import { EmulatorUiSelections } from "../messaging/types";
import { emulatorOutputChannel } from "../data-connect/emulator-stream";

export class EmulatorsController implements Disposable {
  constructor(private broker: ExtensionBrokerImpl) {
    this.subscriptions.push(
      broker.on("getEmulatorUiSelections", () =>
        this.notifyUISelectionChangedListeners()
      )
    );
    // Notify the UI of the emulator selections changes
    this.subscriptions.push(
      effect(() => {
        // Listen for changes.
        this.uiSelections.value;

        // TODO(christhompson): Save UI selections in the current workspace.
        // Requires context object.
        this.notifyUISelectionChangedListeners();
      })
    );

    this.subscriptions.push(
      broker.on("getEmulatorInfos", () => this.notifyEmulatorStateChanged())
    );
    this.subscriptions.push(
      effect(() => {
        // Listen for changes.
        this.emulators.value;

        this.notifyEmulatorStateChanged();
      })
    );

    this.subscriptions.push(
      broker.on("updateEmulatorUiSelections", (uiSelections) => {
        this.uiSelections.value = {
          ...this.uiSelections.peek(),
          ...uiSelections,
        };
      })
    );

    this.subscriptions.push(
      broker.on("selectEmulatorImportFolder", async () => {
        const options: vscode.OpenDialogOptions = {
          canSelectMany: false,
          openLabel: `Pick an import folder`,
          title: `Pick an import folder`,
          canSelectFiles: false,
          canSelectFolders: true,
        };
        const fileUri = await vscode.window.showOpenDialog(options);
        // Update the UI of the selection
        if (!fileUri || fileUri.length < 1) {
          vscode.window.showErrorMessage("Invalid import folder selected.");
          return;
        }
        broker.send("notifyEmulatorImportFolder", {
          folder: fileUri[0].fsPath,
        });
      })
    );

    this.subscriptions.push(
      broker.on("launchEmulators", this.startEmulators.bind(this))
    );
    this.subscriptions.push(
      broker.on("stopEmulators", this.stopEmulators.bind(this))
    );

    this.subscriptions.push(
      effect(() => {
        const projectId = firebaseRC.value?.tryReadValue?.projects?.default;
        this.uiSelections.value = {
          ...this.uiSelections.peek(),
          projectId: this.getProjectIdForMode(
            projectId,
            this.uiSelections.peek().mode
          ),
        };
      })
    );
  }

  private readonly startCommand = vscode.commands.registerCommand(
    "firebase.emulators.start",
    this.startEmulators.bind(this)
  );

  private readonly stopCommand = vscode.commands.registerCommand(
    "firebase.emulators.stop",
    this.stopEmulators.bind(this)
  );

  // TODO(christhompson): Load UI selections from the current workspace.
  // Requires context object.
  readonly uiSelections = signal(DEFAULT_EMULATOR_UI_SELECTIONS);

  readonly emulatorStates = computed(() => {
    if (!this.areEmulatorsRunning.value) {
      return undefined;
    }

    // TODO(rrousselGit) handle cases where one emulator is running,
    // and a new one is started.
    return listRunningEmulators();
  });

  readonly emulators = signal<
    ExtensionToWebviewParamsMap["notifyEmulatorStateChanged"]
  >({
    status: "stopped",
    infos: undefined,
  });

  readonly areEmulatorsRunning = computed(() => {
    return this.emulators.value.status === "running";
  });

  private readonly subscriptions: (() => void)[] = [];

  /**
   * Formats a project ID with a demo prefix if we're in offline mode, or uses the
   * regular ID if we're in hosting only mode.
   */
  private getProjectIdForMode(
    projectId: string | undefined,
    mode: EmulatorUiSelections["mode"]
  ): string {
    if (!projectId) {
      return "demo-something";
    }
    if (mode === "hosting" || mode === "dataconnect") {
      return projectId;
    }
    return "demo-" + projectId;
  }

  notifyUISelectionChangedListeners() {
    this.broker.send(
      "notifyEmulatorUiSelectionsChanged",
      this.uiSelections.value
    );
  }

  notifyEmulatorStateChanged() {
    this.broker.send("notifyEmulatorStateChanged", this.emulators.value);
  }

  async startEmulators() {
    const uiSelections = this.uiSelections.value;

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        title: "Starting emulators",
      },
      async (progress) => {
        progress.report({ increment: 0 });
        try {
          this.emulators.value = {
            status: "starting",
            infos: this.emulators.value.infos,
          };
          await emulatorsStart(uiSelections);
          this.emulators.value = {
            status: "running",
            infos: {
              uiUrl: getEmulatorUiUrl(),
              displayInfo: listRunningEmulators(),
            },
          };

          vscode.window.showInformationMessage(
            "Firebase Extension: Emulators started successfully"
          );

          // data connect specifics; including temp logging implementation
          if (
            listRunningEmulators().filter((emulatorInfos) => {
              emulatorInfos.name === Emulators.DATACONNECT;
            })
          ) {
            const dataConnectEmulatorDetails = getEmulatorDetails(
              Emulators.DATACONNECT
            );

            dataConnectEmulatorDetails.instance.stdout?.on("data", (data) => {
              emulatorOutputChannel.appendLine("DEBUG: " + data.toString());
            });
            dataConnectEmulatorDetails.instance.stderr?.on("data", (data) => {
              if (data.toString().includes("Finished reloading")) {
                vscode.commands.executeCommand("fdc-graphql.restart");
                vscode.commands.executeCommand(
                  "firebase.dataConnect.executeIntrospection"
                );
              } else {
                emulatorOutputChannel.appendLine("ERROR: " + data.toString());
              }
            });
          }
        } catch (e) {
          this.emulators.value = {
            status: "stopped",
            infos: undefined,
          };

          vscode.window.showErrorMessage(
            "Firebase Extension: Emulators start failed - " + e
          );
        }
        progress.report({ increment: 100 });
      }
    );
  }

  async stopEmulators() {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        cancellable: false,
        title: "Stopping emulators",
      },
      async (progress) => {
        progress.report({ increment: 0 });

        this.emulators.value = {
          status: "stopping",
          infos: this.emulators.value.infos,
        };
        await stopEmulators();
        this.emulators.value = {
          status: "stopped",
          infos: undefined,
        };

        vscode.window.showInformationMessage(
          "Firebase Extension: Emulators stopped successfully"
        );

        progress.report({ increment: 100 });
      }
    );
  }

  dispose(): void {
    this.stopEmulators();
    this.subscriptions.forEach((subscription) => subscription());
    this.startCommand.dispose();
    this.stopCommand.dispose();
  }
}
