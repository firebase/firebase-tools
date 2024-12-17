import * as vscode from "vscode";

export class EmulatorsProvider
  implements vscode.TreeDataProvider<EmulatorItem>
{
  constructor() {}

  getTreeItem(element: EmulatorItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: EmulatorItem,
  ): Promise<EmulatorItem[]> | EmulatorItem[] {
    return [new EmulatorItem("Foo", 8080), new EmulatorItem("Bar", 8081)];
  }

  private _onDidChangeTreeData: vscode.EventEmitter<EmulatorItem | undefined> =
    new vscode.EventEmitter<EmulatorItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<EmulatorItem | undefined> =
    this._onDidChangeTreeData.event;
}

class EmulatorItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    port: number,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = `:${port}`;
  }

  iconPath = new vscode.ThemeIcon(
    "circle-filled",
    new vscode.ThemeColor("testing.runAction"),
  );
}
