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

    this.subscriptions.push(
      broker.on("getEmulatorInfos", () => this.findRunningCliEmulators()),
    );
  }

  readonly emulatorStatusItem = vscode.window.createStatusBarItem("emulators");

  private readonly findRunningEmulatorsCommand =
    vscode.commands.registerCommand(
      "firebase.emulators.findRunning",
      this.findRunningCliEmulators.bind(this),
    );

  readonly emulators: { status: EmulatorsStatus, infos: RunningEmulatorInfo } =
    {
      status: "stopped",
      infos: undefined,
    };

  private readonly subscriptions: (() => void)[] = [];

  notifyEmulatorStateChanged() {
    this.broker.send("notifyEmulatorStateChanged", this.emulators);
  }

  // TODO: Move all api calls to CLI DataConnectEmulatorClient
  public getLocalEndpoint =
    () => {
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
      uiUrl: getEmulatorUiUrl(),
      displayInfo: info,
    };
    this.emulators.status = "running";
    this.notifyEmulatorStateChanged();
  }

  public setEmulatorsStarting() {
    this.emulators.status = "starting";
    this.notifyEmulatorStateChanged();
  }

  public setEmulatorsStopping() {
    this.emulators.status = "stopping";
    this.notifyEmulatorStateChanged();
  }

  public setEmulatorsStopped() {
    this.emulators.status = "stopped";
    this.emulators.infos = undefined;
    this.notifyEmulatorStateChanged();
  }

  async findRunningCliEmulators() {
    const projectId = firebaseRC.value?.tryReadValue?.projects?.default;
    // TODO: think about what to without projectID, in potentially a logged out mode
    const hubClient = new EmulatorHubClient(projectId);

    if (hubClient.foundHub()) {
      const response: GetEmulatorsResponse = await hubClient.getEmulators();

      if (Object.values(response)) {
        this.setEmulatorsRunningInfo(Object.values(response));
      } else {
        this.setEmulatorsStopped();
      }
    }
  }

  public areEmulatorsRunning() {
    return this.emulators.status === "running";
  }

  dispose(): void {
    this.subscriptions.forEach((subscription) => subscription());
    this.findRunningEmulatorsCommand.dispose();
    this.emulatorStatusItem.dispose();
  }
}
