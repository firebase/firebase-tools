import { Workbench } from "wdio-vscode-service";

export class StatusBar {
  constructor(readonly workbench: Workbench) {}

  get emulatorsStatus() {
    return $('[id="firebase.firebase-vscode.emulators"]');
  }

  get currentProjectElement() {
    return $('[id="firebase.firebase-vscode.projectPicker"]');
  }
}
