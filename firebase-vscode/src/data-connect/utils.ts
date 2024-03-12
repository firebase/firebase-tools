import vscode, { Uri } from "vscode";

export async function checkIfFileExists(file: Uri) {
  try {
    await vscode.workspace.fs.stat(file);
    return true;
  } catch {
    return false;
  }
}
