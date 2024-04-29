import * as vscode from "vscode"; // from //third_party/vscode/src/vs:vscode
import { effect } from "@preact/signals-core";
import { ExecutionItem, ExecutionState, executions } from "./execution-store";

const timeFormatter = new Intl.DateTimeFormat("default", {
  timeStyle: "long",
});

/**
 * The TreeItem for an execution.
 */
export class ExecutionTreeItem extends vscode.TreeItem {
  parent?: ExecutionTreeItem;
  children: ExecutionTreeItem[] = [];

  constructor(readonly item: ExecutionItem) {
    super(item.label, vscode.TreeItemCollapsibleState.None);
    this.item = item;

    // Renders arguments in a single line
    const prettyArgs = this.item.args?.replaceAll(/[\n \t]+/g, " ");
    this.description = `${timeFormatter.format(
      item.timestamp
    )} | Arguments: ${prettyArgs}`;
    this.command = {
      title: "Show result",
      command: "firebase.dataConnect.selectExecutionResultToShow",
      arguments: [item.executionId],
    };
    this.updateContext();
  }

  updateContext() {
    this.contextValue = "executionTreeItem-finished";
    if (this.item.state === ExecutionState.FINISHED) {
      this.iconPath = new vscode.ThemeIcon(
        "pass",
        new vscode.ThemeColor("testing.iconPassed")
      );
    } else if (this.item.state === ExecutionState.CANCELLED) {
      this.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("testing.iconErrored")
      );
    } else if (this.item.state === ExecutionState.ERRORED) {
      this.iconPath = new vscode.ThemeIcon(
        "close",
        new vscode.ThemeColor("testing.iconFailed")
      );
    } else if (this.item.state === ExecutionState.RUNNING) {
      this.contextValue = "executionTreeItem-running";
      this.iconPath = new vscode.ThemeIcon(
        "sync~spin",
        new vscode.ThemeColor("testing.runAction")
      );
    }
  }
}

/**
 * The TreeDataProvider for data connect execution history.
 */
export class ExecutionHistoryTreeDataProvider
  implements vscode.TreeDataProvider<ExecutionTreeItem>
{
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> =
    this.onDidChangeTreeDataEmitter.event;
  executionItems: ExecutionTreeItem[] = [];

  constructor() {
    effect(() => {
      this.executionItems = Object.values(executions.value)
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((item) => new ExecutionTreeItem(item));

      this.onDidChangeTreeDataEmitter.fire();
    });
  }

  getTreeItem(element: ExecutionTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExecutionTreeItem): ExecutionTreeItem[] {
    if (element) {
      return element.children;
    } else {
      return this.executionItems;
    }
  }

  getParent(element?: ExecutionTreeItem): ExecutionTreeItem | undefined {
    return element?.parent;
  }
}
