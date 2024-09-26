import vscode from "vscode";

export async function suggestGraphqlSyntaxExtension() {
  // Skip if this is a test run
  // if (process.env.TEST === "true") {
  //   return;
  // }

  const graphqlSyntaxExt = "graphql.vscode-graphql-syntax";
  const firebaseExt = "myExtension";
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
