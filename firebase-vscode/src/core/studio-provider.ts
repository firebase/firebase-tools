import { effect, Signal, ReadonlySignal } from "@preact/signals-core";
import * as vscode from "vscode";
import { User } from "./user";

export class StudioProvider
  implements vscode.TreeDataProvider<StudioItem | UserItem | ProjectItem>
{
  private readonly userItem = new UserItem();
  private readonly projectItem = new ProjectItem();

  constructor(
    public readonly currentUser: Signal<User | null>,
    public readonly currentProjectId: ReadonlySignal<string | undefined>,
  ) {}

  getTreeItem(element: StudioItem | UserItem): vscode.TreeItem {
    return element;
  }

  getChildren(
    element?: vscode.TreeItem,
  ): Array<StudioItem | UserItem | ProjectItem> {
    return [this.userItem, this.projectItem];
  }

  _onDidChangeTreeData: vscode.EventEmitter<StudioItem | UserItem | undefined> =
    new vscode.EventEmitter<StudioItem | UserItem | undefined>();
  onDidChangeTreeData = this._onDidChangeTreeData.event;

  updateUser(user?: User) {
    this.userItem.label = user?.email ?? "Not logged in";
    this._onDidChangeTreeData.fire(this.userItem);
  }

  updateProject(projectId?: string) {
    this.projectItem.label = projectId ?? "No project selected";
    this._onDidChangeTreeData.fire(this.projectItem);
  }
}

export class StudioItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
  }

  iconPath = new vscode.ThemeIcon("account");
}

class UserItem extends vscode.TreeItem {
  constructor() {
    super("", vscode.TreeItemCollapsibleState.None);
  }

  iconPath = new vscode.ThemeIcon("account");
}

class ProjectItem extends vscode.TreeItem {
  constructor() {
    super("", vscode.TreeItemCollapsibleState.None);
  }

  iconPath = new vscode.ThemeIcon("project");
}
