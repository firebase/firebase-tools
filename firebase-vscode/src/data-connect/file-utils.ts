import vscode, { Uri } from "vscode";
import path from "path";

export async function checkIfFileExists(file: Uri) {
  try {
    await vscode.workspace.fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** Opens a file in the editor. If the file is missing, opens an untitled file
 * with the content provided by the `content` function.
 */
export async function upsertFile(
  uri: vscode.Uri,
  content: () => string | string,
): Promise<void> {
  const doesFileExist = await checkIfFileExists(uri);


  // Have to write to file system first before opening
  // otherwise we can't save it without closing it
  if (!doesFileExist) {
    vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content()));
  }

  // Opens existing text document
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
}
