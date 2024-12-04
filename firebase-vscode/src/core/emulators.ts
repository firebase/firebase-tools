import vscode, { Disposable, ThemeColor } from "vscode";
import { Emulators, getEmulatorUiUrl } from "../cli";
import { ExtensionBrokerImpl } from "../extension-broker";
import { firebaseRC } from "./config";
import { EmulatorsStatus, RunningEmulatorInfo } from "../messaging/types";
import { EmulatorHubClient } from "../../../src/emulator/hubClient";
import { GetEmulatorsResponse } from "../../../src/emulator/hub";
import { EmulatorInfo } from "../emulator/types";
import { signal } from "@preact/signals-core";
import { dataConnectConfigs } from "../data-connect/config";
import { runEmulatorIssuesStream } from "../data-connect/emulator-stream";
import { getSettings } from "../utils/settings";
export class EmulatorsController implements Disposable {
  constructor(private broker: ExtensionBrokerImpl) {
    this.emulatorStatusItem.command = "firebase.openFirebaseRc";

    // called by emulator UI
    this.subscriptions.push(
      broker.on("getEmulatorInfos", () => this.findRunningCliEmulators()),
    );

    // called by emulator UI
    this.subscriptions.push(
      broker.on("runStartEmulators", () => {
        this.setEmulatorsStarting();
      }),
    );

    // Subscription to open up settings window
    this.subscriptions.push(
      broker.on("fdc.open-emulator-settings", () => {
        vscode.commands.executeCommand( 'workbench.action.openSettings', 'firebase.emulators' );
      })
    );

    // Subscription to trigger clear emulator data when button is clicked.
    this.subscriptions.push(
      broker.on("fdc.clear-emulator-data", () => {
        vscode.commands.executeCommand("firebase.emulators.clearData");
      }),
    );

    // Subscription to trigger emulator exports when button is clicked.
    this.subscriptions.push(broker.on("runEmulatorsExport", () => {
      vscode.commands.executeCommand("firebase.emulators.exportData")
    }));
  }

  readonly emulatorStatusItem = vscode.window.createStatusBarItem("emulators");
  private currExecId = 0;

  public async startEmulators() {
    this.setEmulatorsStarting();
    vscode.commands.executeCommand("firebase.emulators.start");
  }
  // called by webhook
  private readonly findRunningEmulatorsCommand =
    vscode.commands.registerCommand(
      "firebase.emulators.findRunning",
      this.findRunningCliEmulators.bind(this),
    );

  // called by webhook
  private readonly emulatorsStoppped = vscode.commands.registerCommand(
    "firebase.emulators.stopped",
    this.setEmulatorsStopped.bind(this),
  );

  private readonly clearEmulatorDataCommand = vscode.commands.registerCommand(
    "firebase.emulators.clearData",
    this.clearDataConnectData.bind(this),
  );


  private readonly exportEmulatorDataCommand = vscode.commands.registerCommand(
    "firebase.emulators.exportData",
    this.exportEmulatorData.bind(this),
  );

  readonly emulators: { status: EmulatorsStatus; infos?: RunningEmulatorInfo } =
    {
      status: "stopped",
    };

  private readonly subscriptions: (() => void)[] = [];

  notifyEmulatorStateChanged() {
    this.broker.send("notifyEmulatorStateChanged", this.emulators);
  }

  // TODO: Move all api calls to CLI DataConnectEmulatorClient
  public getLocalEndpoint = () => {
    const emulatorInfos = this.emulators.infos?.displayInfo;
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
  };

  public setEmulatorsRunningInfo(info: EmulatorInfo[]) {
    this.emulators.infos = {
      uiUrl: getEmulatorUiUrl()!,
      displayInfo: info,
    };
    this.emulators.status = "running";
    this.notifyEmulatorStateChanged();

    this.connectToEmulatorStream();
  }

  public setEmulatorsStarting() {
    this.emulators.status = "starting";
    this.notifyEmulatorStateChanged();

    this.currExecId += 1;
    const execId = this.currExecId;

    // fallback in case we're stuck in a loading state
    setTimeout(async () => {
      if (this.emulators.status === "starting" && this.currExecId === execId) {
        // notify UI to show reset
        this.broker.send("notifyEmulatorsHanging", true);
      }
    }, 10000); // default 10 seconds spin up time
  }

  public setEmulatorsStopping() {
    this.emulators.status = "stopping";
    this.notifyEmulatorStateChanged();
  }

  public setEmulatorsStopped() {
    this.emulators.status = "stopped";
    this.notifyEmulatorStateChanged();
  }

  async findRunningCliEmulators(): Promise<
    { status: EmulatorsStatus; infos?: RunningEmulatorInfo }
  > {
    const hubClient = this.getHubClient();
    if (hubClient) {
      const response: GetEmulatorsResponse = await hubClient.getEmulators();

      if (Object.values(response)) {
        this.setEmulatorsRunningInfo(Object.values(response));
      } else {
        this.setEmulatorsStopped();
      }
    }
    return this.emulators;
  }

  async clearDataConnectData(): Promise<void> {
    const hubClient = this.getHubClient();
    if (hubClient) {
      await hubClient.clearDataConnectData();
      vscode.window.showInformationMessage(`Data Connect emulator data has been cleared.`);
    }
  }

  async exportEmulatorData(): Promise<void> {
    const settings = getSettings();
    const exportDir = settings.exportPath;
    const hubClient = this.getHubClient();
    if (hubClient) {
      // TODO: Make exportDir configurable
      await hubClient.postExport({path: exportDir, initiatedBy: "Data Connect VSCode extension"});
      vscode.window.showInformationMessage(`Emulator Data exported to ${exportDir}`);
    }
  }

  private getHubClient(): EmulatorHubClient | undefined {
    const projectId = firebaseRC.value?.tryReadValue?.projects?.default;
    // TODO: think about what to without projectID, in potentially a logged out mode
    const hubClient = new EmulatorHubClient(projectId!);
    if (hubClient.foundHub()) {
      return hubClient;
    } else {
      this.setEmulatorsStopped();
    }
  }

  public async areEmulatorsRunning(): Promise<boolean> {
    if (this.emulators.status === "running") {
      return true;
    }
    return (await this.findRunningCliEmulators())?.status === "running";
  }

  /** FDC specific functions */
  readonly isPostgresEnabled = signal(false);
  private connectToEmulatorStream() {
    const configs = dataConnectConfigs.value?.tryReadValue!;

    if (this.getLocalEndpoint()) {
      // only if FDC emulator endpoint is found
      runEmulatorIssuesStream(
        configs,
        this.getLocalEndpoint()!,
        this.isPostgresEnabled,
      );
    }
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription());
    this.findRunningEmulatorsCommand.dispose();
    this.emulatorStatusItem.dispose();
    this.emulatorsStoppped.dispose();
    this.clearEmulatorDataCommand.dispose();
    this.exportEmulatorDataCommand.dispose();
  }
}
