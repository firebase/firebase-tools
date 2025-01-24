import { Workbench } from "wdio-vscode-service";

export class TerminalView {
  constructor(readonly workbench: Workbench) {}

  private readonly bottomBar = this.workbench.getBottomBar();
  async getTerminalText() {
    const tv = await this.bottomBar.openTerminalView();
    return tv.getText();
  }
}
