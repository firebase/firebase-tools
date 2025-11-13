import { Workbench } from "wdio-vscode-service";

export class TerminalView {
  constructor(readonly workbench: Workbench) {}

  private readonly bottomBar = this.workbench.getBottomBar();
  async getTerminalText() {
    const tv = await this.bottomBar.openTerminalView();
    /** 
     * SEE: https://github.com/webdriverio-community/wdio-vscode-service/blob/e4ef4d5a1da194e9a6195fad881733c3aa6720d8/src/pageobjects/workbench/Workbench.ts#L183
     * The code recognizes our webview, and chooses to send `F1` as an input instead of as a keystroke.
     */
    await browser.keys("F1");
    return await tv.getText();
  }
}
