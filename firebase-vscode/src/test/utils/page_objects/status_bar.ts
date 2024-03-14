import { Workbench } from "wdio-vscode-service";

export class StatusBar {
  constructor(readonly workbench: Workbench) {}

  get currentInstanceElement() {
    return $('[id="firebase.firebase-vscode.instancePicker"]');
  }

  get currentProjectElement() {
    return $('[id="firebase.firebase-vscode.projectPicker"]');
  }
}
