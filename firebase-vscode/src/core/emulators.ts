import vscode, { Disposable, ThemeColor } from "vscode";
import { Emulators, getEmulatorUiUrl } from "../cli";
import { ExtensionBrokerImpl } from "../extension-broker";
import { firebaseRC } from "./config";
import { EmulatorsStatus, RunningEmulatorInfo } from "../messaging/types";
import { EmulatorHubClient } from "../../../src/emulator/hubClient";
import { GetEmulatorsResponse } from "../../../src/emulator/hub";
import { EmulatorInfo } from "../emulator/types";
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
  }

  readonly emulatorStatusItem = vscode.window.createStatusBarItem("emulators");
  private currExecId = 0;

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

  readonly emulators: { status: EmulatorsStatus; infos?: RunningEmulatorInfo } =
    {
      status: "stopped",
    };

  private readonly subscriptions: (() => void)[] = [];

  notifyEmulatorStateChanged() {
    this.broker.send("notifyEmulatorStateChanged", this.emulators);
    vscode.commands.executeCommand("refreshCodelens");
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

  async findRunningCliEmulators() {
    const projectId = firebaseRC.value?.tryReadValue?.projects?.default;
    // TODO: think about what to without projectID, in potentially a logged out mode
    const hubClient = new EmulatorHubClient(projectId!);

    if (hubClient.foundHub()) {
      const response: GetEmulatorsResponse = await hubClient.getEmulators();

      if (Object.values(response)) {
        this.setEmulatorsRunningInfo(Object.values(response));
      } else {
        this.setEmulatorsStopped();
      }
    } else {
      this.setEmulatorsStopped();
    }
  }

  public areEmulatorsRunning() {
    return this.emulators.status === "running";
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription());
    this.findRunningEmulatorsCommand.dispose();
    this.emulatorStatusItem.dispose();
    this.emulatorsStoppped.dispose();
  }
}
