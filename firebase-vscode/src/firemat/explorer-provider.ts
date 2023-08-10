import * as vscode from "vscode"; // from //third_party/vscode/src/vs:vscode

/**
 * The TreeItem for an explorer item.
 */
export class ExplorerTreeItem extends vscode.TreeItem {
  parent?: ExplorerTreeItem;
  children: ExplorerTreeItem[] = [];

  constructor(
    label: string | vscode.TreeItemLabel,
    collapsibleState: vscode.TreeItemCollapsibleState,
    children: ExplorerTreeItem[],
    description?: string,
    tooltip?: string,
    command?: vscode.Command,
    readonly startLine?: number,
    readonly startColumn?: number
  ) {
    super(label, collapsibleState);
    this.children = children;
    this.description = description;
    this.tooltip = tooltip;
    this.command = command;
    for (const c of children) {
      c.parent = this;
    }
    this.updateContext();
  }

  updateChildren(children: ExplorerTreeItem[]) {
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
    this.iconPath = new vscode.ThemeIcon(
      "pass",
      new vscode.ThemeColor("testing.iconPassed")
    );
    this.contextValue = "explorerTreeItem";
  }
}

/**
 * The TreeDataProvider for firemat explorer.
 */
export class ExplorerTreeDataProvider
  implements vscode.TreeDataProvider<ExplorerTreeItem>
{
  private readonly onDidChangeTreeDataImitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData: vscode.Event<void> =
    this.onDidChangeTreeDataImitter.event;
  explorerItems: ExplorerTreeItem[] = [];

  refresh(explorerItems: ExplorerTreeItem[]) {
    this.explorerItems = explorerItems;
    this.onDidChangeTreeDataImitter.fire(undefined);
  }

  getTreeItem(element: ExplorerTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExplorerTreeItem): ExplorerTreeItem[] {
    if (element) {
      return element.children;
    } else {
      return this.explorerItems;
    }
  }

  getParent(element?: ExplorerTreeItem): ExplorerTreeItem | undefined {
    return element?.parent;
  }
}
