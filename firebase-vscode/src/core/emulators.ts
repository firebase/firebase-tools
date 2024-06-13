import vscode, { Disposable, ThemeColor } from "vscode";
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
    this.emulatorStatusItem.command = "firebase.openFirebaseRc";

    this.subscriptions.push(
      broker.on("getEmulatorUiSelections", () =>
        this.notifyUISelectionChangedListeners(),
      ),
    );
    // Notify the UI of the emulator selections changes
    this.subscriptions.push(
      effect(() => {
        // Listen for changes.
        this.uiSelections.value;

        // TODO(christhompson): Save UI selections in the current workspace.
        // Requires context object.
        this.notifyUISelectionChangedListeners();
      }),
    );

    this.subscriptions.push(
      broker.on("getEmulatorInfos", () => this.notifyEmulatorStateChanged()),
    );
    this.subscriptions.push(
      effect(() => {
        // Listen for changes.
        this.emulators.value;

        this.notifyEmulatorStateChanged();
      }),
    );

    this.subscriptions.push(
      broker.on("updateEmulatorUiSelections", (uiSelections) => {
        this.uiSelections.value = {
          ...this.uiSelections.peek(),
          ...uiSelections,
        };
      }),
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
      }),
    );

    this.subscriptions.push(
      effect(() => {
        const projectId = firebaseRC.value?.tryReadValue?.projects?.default;
        this.uiSelections.value = {
          ...this.uiSelections.peek(),
          projectId: this.getProjectIdForMode(
            projectId,
            this.uiSelections.peek().mode,
          ),
        };
      }),
    );
  }

  readonly emulatorStatusItem = vscode.window.createStatusBarItem("emulators");

  private pendingEmulatorStart: Promise<void> | undefined;

  private readonly waitCommand = vscode.commands.registerCommand(
    "firebase.emulators.wait",
    this.waitEmulators.bind(this),
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
    mode: EmulatorUiSelections["mode"],
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
      this.uiSelections.value,
    );
  }

  notifyEmulatorStateChanged() {
    this.broker.send("notifyEmulatorStateChanged", this.emulators.value);
  }

  async waitEmulators() {
    await this.pendingEmulatorStart;
  }

  async startEmulators() {
    this.emulators.value = {
      status: "starting",
      infos: this.emulators.value.infos,
    };

    const currentOp = (this.pendingEmulatorStart = new Promise(async () => {
      try {
        await emulatorsStart(this.uiSelections.value);
        this.emulators.value = {
          status: "running",
          infos: {
            displayInfo: listRunningEmulators(),
          },
        };
        // TODO: Add other emulator icons
        this.emulatorStatusItem.text = "$(data-connect) Emulators: Running";

        // data connect specifics; including temp logging implementation
        if (
          listRunningEmulators().filter((emulatorInfos) => {
            emulatorInfos.name === Emulators.DATACONNECT;
          })
        ) {
          const dataConnectEmulatorDetails = getEmulatorDetails(
            Emulators.DATACONNECT,
          );

          dataConnectEmulatorDetails.instance.stdout?.on("data", (data) => {
            emulatorOutputChannel.appendLine("DEBUG: " + data.toString());
          });
          dataConnectEmulatorDetails.instance.stderr?.on("data", (data) => {
            if (data.toString().includes("Finished reloading")) {
              vscode.commands.executeCommand("fdc-graphql.restart");
              vscode.commands.executeCommand(
                "firebase.dataConnect.executeIntrospection",
              );
            } else {
              emulatorOutputChannel.appendLine("ERROR: " + data.toString());
            }
          });
        }

        // Updating the status bar label as "running", but don't "show" it.
        // We only show the status bar item when explicitly by interacting with the sidebar.
        this.emulatorStatusItem.text = "$(data-connect) Emulators: Running";
        this.emulatorStatusItem.backgroundColor = undefined;
      } catch (e) {
        console.log("HAROLD: ", e);
        this.emulatorStatusItem.text = "$(data-connect) Emulators: errored";
        this.emulatorStatusItem.backgroundColor = new ThemeColor(
          "statusBarItem.errorBackground",
        );
        this.emulatorStatusItem.show();
        this.emulators.value = {
          status: "stopped",
          infos: undefined,
        };
      }

      if (currentOp === this.pendingEmulatorStart) {
        this.pendingEmulatorStart = undefined;
      }
    }));

    return currentOp;
  }

  async stopEmulators() {
    this.emulators.value = {
      status: "stopping",
      infos: this.emulators.value.infos,
    };
    await stopEmulators();
    this.emulators.value = {
      status: "stopped",
      infos: undefined,
    };
  }

  // TODO: Move all api calls to CLI DataConnectEmulatorClient
  public getLocalEndpoint = () => computed<string | undefined>(() => {
    const emulatorInfos = this.emulators.value.infos?.displayInfo;
    const dataConnectEmulator = emulatorInfos?.find(
      (emulatorInfo) => emulatorInfo.name === Emulators.DATACONNECT,
    );

    if (!dataConnectEmulator) {
      return undefined;
    }

    // handle ipv6
    if (dataConnectEmulator.host.includes(":")) {
      return `http://[${dataConnectEmulator.host}]:${dataConnectEmulator.port}`;
    }
    return `http://${dataConnectEmulator.host}:${dataConnectEmulator.port}`;
  });

  dispose(): void {
    this.stopEmulators();
    this.subscriptions.forEach((subscription) => subscription());
    this.waitCommand.dispose();
    this.emulatorStatusItem.dispose();
  }
}
