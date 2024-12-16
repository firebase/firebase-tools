import * as vscode from "vscode";

export class SessionProvider implements vscode.TreeDataProvider<SessionItem> {
  private readonly userItem = new UserItem();
  private readonly projectItem = new ProjectItem();

  constructor() {}

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SessionItem[] {
    return [this.userItem, this.projectItem];
  }

  _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>();
  onDidChangeTreeData = this._onDidChangeTreeData.event;

  updateEmail(email?: string) {
    this.userItem.label = email ?? "Not logged in";
    this._onDidChangeTreeData.fire(this.userItem);
  }

  updateProjectId(projectId?: string) {
    this.projectItem.label = projectId ?? "No project selected";
    this._onDidChangeTreeData.fire(this.projectItem);
  }
}

type SessionItem = UserItem | ProjectItem;

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
