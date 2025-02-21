import { Workbench } from "wdio-vscode-service";
import { findWebviewWithTitle, runInFrame } from "../webviews";

export class ExecutionPanel {
  constructor(readonly workbench: Workbench) {
    this.history = new HistoryView(workbench);
  }

  readonly history: HistoryView;

  async open(): Promise<void> {
    await this.workbench.executeCommand(
      "data-connect-execution-configuration.focus",
    );
  }

  async getVariables(): Promise<string> {
    return this.runInConfigurationContext(async (configs) => {
      return configs.variablesTextarea.getValue();
    });
  }

  async setVariables(variables: string): Promise<void> {
    // TODO revert to the original value after test

    await this.runInConfigurationContext(async (configs) => {
      await configs.variablesTextarea.setValue(variables);
    });
  }

  async clickRerun(): Promise<void> {
    return this.runInConfigurationContext(async (configs) => {
      const rerunButton = await configs.rerunButton;
      await rerunButton.waitForClickable();
      await rerunButton.doubleClick(); // double click first transitions focus to window instead of notifs
    });
  }

  async runInConfigurationContext<R>(
    cb: (configs: ConfigurationView) => Promise<R>,
  ): Promise<R> {
    const [a, b] = await findWebviewWithTitle("Configuration");

    return runInFrame(a, () =>
      runInFrame(b, () => cb(new ConfigurationView(this.workbench))),
    );
  }
}

export class ConfigurationView {
  constructor(readonly workbench: Workbench) {}

  get variablesView() {
    return $(`vscode-panel-view[aria-labelledby="tab-1"]`);
  }

  get variablesTextarea() {
    return this.variablesView.$("textarea");
  }

  get rerunButton() {
    return this.variablesView.$("vscode-button");
  }
}

export class HistoryView {
  constructor(readonly workbench: Workbench) {}

  get itemsElement() {
    return $$(".monaco-list-row");
  }

  get selectedItemElement() {
    return $(".monaco-list-row.selected");
  }

  async getSelectedItem(): Promise<HistoryItem> {
    return new HistoryItem(await this.selectedItemElement);
  }

  async getItems(): Promise<HistoryItem[]> {
    // Array.from as workaround to https://github.com/webdriverio-community/wdio-vscode-service/issues/100#issuecomment-1932468126
    const items = Array.from(await this.itemsElement);

    return items.map((item) => new HistoryItem(item));
  }
}

export class HistoryItem {
  constructor(private readonly elem: WebdriverIO.Element) {}

  get iconElement() {
    return this.elem.$(".custom-view-tree-node-item-icon");
  }

  get labelElement() {
    return this.elem.$(".label-name");
  }

  get descriptionElement() {
    return this.elem.$(".label-description");
  }

  async getStatus(): Promise<"success" | "error" | "pending" | "warning"> {
    const icon = await this.iconElement;
    const clazz = await icon.getAttribute("class");

    const classes = clazz.split(" ");

    if (classes.includes("codicon-pass")) {
      return "success";
    }

    if (classes.includes("codicon-warning")) {
      return "warning";
    }

    if (classes.includes("codicon-close")) {
      return "error";
    }

    return "pending";
  }

  async getLabel() {
    return this.labelElement.getText();
  }

  async getDescription() {
    return this.descriptionElement.getText();
  }
}
