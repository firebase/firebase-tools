import vscode, { Uri } from "vscode";
import path from "path";
import * as fs from "fs";

import { dataConnectConfigs, ResolvedDataConnectConfig } from "./config";
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

export function getHighlightedText(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return "";
  }
  const selection = editor.selection;

  const selectionRange = new vscode.Range(
    selection.start.line,
    selection.start.character,
    selection.end.line,
    selection.end.character,
  );
  return editor.document.getText(selectionRange);
}

export async function insertQueryAt(uri: vscode.Uri, at: number, existing: string, replace: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  if (!existing) {
    if (text[at-1] !== "\n") {
      replace = "\n" + replace;
    }
    const newText = text.slice(0, at) + replace + text.slice(at);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newText));
    return;
  }
  if (text.slice(at, at + existing.length) !== existing) {
    throw new Error("The existing query was updated.");
  }
  const newText = text.slice(0, at) + replace + text.slice(at + existing.length);
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(newText));
}

// given a file path, compile all gql files for the associated connector
export async function getConnectorGqlFiles(
  filePath: string,
): Promise<string[]> {
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

export async function findGqlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter(
        (file) =>
          !file.isDirectory() &&
          (file.name.endsWith(".gql") || file.name.endsWith(".graphql")),
      )
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

/**
 * Fetches the schema files and returns them in the format expected by the Gemini API.
 */
export async function getSchemas(
  serviceConfig: ResolvedDataConnectConfig,
): Promise<any[]> {
  const schemas: any[] = [];
  const mainSchemaDir = path.join(
    serviceConfig.path,
    serviceConfig.mainSchemaDir,
  );
  const secondaryDirs = serviceConfig.secondarySchemaDirs.map((dir) =>
    path.join(serviceConfig.path, dir),
  );

  const schemaFiles: string[] = [];
  schemaFiles.push(...(await findGqlFiles(mainSchemaDir)));
  for (const dir of secondaryDirs) {
    schemaFiles.push(...(await findGqlFiles(dir)));
  }

  const files = await Promise.all(
    schemaFiles.map(async (file) => {
      const content = await fs.promises.readFile(file, "utf-8");
      return {
        path: path.basename(file),
        content: content,
      };
    }),
  );

  if (files.length > 0) {
    schemas.push({
      source: {
        files: files,
      },
    });
  }

  return schemas;
}


/**
 * Checks if a given file is a schema file based on the provided FDCConfig object.
 * @param fdcConfigs FDCConfig object
 * @param fileName The path to the file to check.
 * @returns true if the file is a schema file, false otherwise.
 */
export async function isSchemaFile(fdcConfigs: any, fileName: string): Promise<boolean> {
    if (!fdcConfigs) {
      return false;
    }
    const service = fdcConfigs.findEnclosingServiceForPath(fileName);
    if (!service) {
      return false;
    }

    const mainSchemaDir = path.join(service.path, service.mainSchemaDir);
    const secondaryDirs = service.secondarySchemaDirs.map((dir: string) => path.join(service.path, dir));
    
    // Only provide schema code lenses for files inside the schema directories.
    // This avoids parsing non-schema files (e.g. query files) which improves performance.
    return isPathInside(fileName, mainSchemaDir) || 
                         secondaryDirs.some((dir: string) => isPathInside(fileName, dir));

}