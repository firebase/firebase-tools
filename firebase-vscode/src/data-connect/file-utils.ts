import vscode, { Uri } from "vscode";
import path from "path";
import * as fs from "fs";

import { dataConnectConfigs } from "./config";
import { pluginLogger } from "../logger-wrapper";

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

// given a file path, compile all gql files for the associated connector
export async function getConnectorGqlFiles(filePath: string): Promise<string[]> {
  const service =
    dataConnectConfigs?.value?.tryReadValue?.findEnclosingServiceForPath(
      filePath || "",
    );

  if (!service) {
    // The entrypoint is not a codelens file, so we can't determine the service.
    return [];
  }

  const gqlFiles: string[] = [];
  const activeDocumentConnector = service.findEnclosingConnectorForPath(
    vscode.window.activeTextEditor?.document.uri.fsPath || "",
  );

  return await findGqlFiles(activeDocumentConnector?.path || "");
}

export async function getConnectorGQLText(filePath: string): Promise<string> {
  const files = await getConnectorGqlFiles(filePath);
  return getTextFromFiles(files);
}

export function getTextFromFiles(files: string[]): string {
  return files.reduce((acc, filePath) => {
    try {
      return acc.concat(fs.readFileSync(filePath, "utf-8"), "\n");
    } catch (error) {
      console.error(`${filePath} not found. Skipping file.`);
      return acc;
    }
  }, "");
}

async function findGqlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((file) => !file.isDirectory() && (file.name.endsWith(".gql") || file.name.endsWith(".graphql")))
      .map((file) => path.join(dir, file.name));

    const folders = entries.filter((folder) => folder.isDirectory());

    for (const folder of folders) {
      files.push(...(await findGqlFiles(path.join(dir, folder.name))));
    }
    return files;
  } catch (error) {
    pluginLogger.error(`Failed to find GQL files: ${error}`);
    return [];
  }
}
