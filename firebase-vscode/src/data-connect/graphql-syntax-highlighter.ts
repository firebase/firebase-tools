import vscode from "vscode";

export async function suggestGraphqlSyntaxExtension() {
  const graphqlSyntaxExt = "graphql.vscode-graphql-syntax";
  const firebaseExt = "firebase.dataConnect";
  const gql = vscode.extensions.getExtension(graphqlSyntaxExt);

  if (
    !gql &&
    vscode.workspace.getConfiguration(firebaseExt).get("recommendExt", true)
  ) {
    const message =
      "It is recommended to install GraphQL: Syntax Highlighter extension. Do you want to install it now?";
    const choice = await vscode.window.showInformationMessage(
      message,
      "Install",
      "Not now",
      "Do not show again",
    );
    if (choice === "Install") {
      await vscode.commands.executeCommand("extension.open", graphqlSyntaxExt);
      await vscode.commands.executeCommand(
        "workbench.extensions.installExtension",
        graphqlSyntaxExt,
      ); // install the extension.
    } else if (choice === "Do not show again") {
      vscode.workspace.getConfiguration(firebaseExt).set("recommendExt", false);
    }
  }
}
