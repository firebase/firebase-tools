import * as vscode from "vscode"; // from //third_party/vscode/src/vs:vscode

enum ExecutionState {
  INIT,
  RUNNING,
  CANCELLED,
  ERRORED,
  FINISHED,
}

/**
 * The TreeItem for an execution.
 */
export class ExecutionTreeItem extends vscode.TreeItem {
  parent?: ExecutionTreeItem;
  children: ExecutionTreeItem[] = [];
  executionId?: string;
  exeuctionState = ExecutionState.INIT;
  private isFinished: boolean;

  constructor(
    label: string | vscode.TreeItemLabel,
    collapsibleState: vscode.TreeItemCollapsibleState,
    children: ExecutionTreeItem[],
    isFinished: boolean,
    executionId?: string,
    description?: string,
    tooltip?: string,
    command?: vscode.Command,
    readonly startLine?: number,
    readonly startColumn?: number
  ) {
    super(label, collapsibleState);
    this.children = children;
    this.isFinished = isFinished;
    this.executionId = executionId;
    this.description = description;
    this.tooltip = tooltip;
    this.command = command;
    for (const c of children) {
      c.parent = this;
    }
    this.updateContext();
  }

  setState(isFinished: boolean, executionState: ExecutionState) {
    this.isFinished = isFinished;
    this.exeuctionState = executionState;
    this.updateContext();
  }

  updateChildren(children: ExecutionTreeItem[]) {
    this.children = children;
    for (const c of children) {
      c.parent = this;
    }
    this.collapsibleState =
      children.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;
  }

  updateContext() {
    if (this.isFinished) {
      this.contextValue = "executionTreeItem-finished";
      if (this.exeuctionState === ExecutionState.FINISHED) {
        this.iconPath = new vscode.ThemeIcon(
          "pass",
          new vscode.ThemeColor("testing.iconPassed")
        );
      } else if (this.exeuctionState === ExecutionState.CANCELLED) {
        this.iconPath = new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("testing.iconErrored")
        );
      } else {
        this.iconPath = new vscode.ThemeIcon(
          "close",
          new vscode.ThemeColor("testing.iconFailed")
        );
      }
    } else {
      this.contextValue = "executionTreeItem-running";
      this.iconPath = new vscode.ThemeIcon(
        "sync~spin",
        new vscode.ThemeColor("testing.runAction")
      );
    }
  }
}

/**
 * The TreeDataProvider for firemat execution history.
 */
export class ExecutionHistoryTreeDataProvider
  implements vscode.TreeDataProvider<ExecutionTreeItem>
{
  private readonly onDidChangeTreeDataImitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> =
    this.onDidChangeTreeDataImitter.event;
  executionItems: ExecutionTreeItem[] = [];

  refresh(executionItems: ExecutionTreeItem[]) {
    this.executionItems = executionItems;
    this.onDidChangeTreeDataImitter.fire(undefined);
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
