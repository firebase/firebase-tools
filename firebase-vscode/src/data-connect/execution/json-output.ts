import vscode, {
} from "vscode";

export async function displayJsonFile(content: string) {
  const doc = await vscode.workspace.openTextDocument(
    {language: "json", content}
  );
}