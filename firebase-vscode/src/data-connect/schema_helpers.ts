import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DataConnectEmulator } from "../../../src/emulator/dataconnectEmulator";
import { GraphqlError } from "../../../src/dataconnect/types";
import { findGqlFiles } from "./file-utils";
import { ResolvedDataConnectConfig } from "./config";

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
 * Verifies that the schema compiles. If there are schema errors (excluding warnings and operation errors),
 * it shows an error message and provides an option to open the file.
 * @returns true if the schema compiles successfully (or has only non-blocking errors), false otherwise.
 */
export async function verifySchemaCompiles(
  serviceConfig: ResolvedDataConnectConfig,
  projectId: string,
): Promise<boolean> {
  try {
    const buildResult = await DataConnectEmulator.build({
      configDir: serviceConfig.path,
      projectId: projectId,
    });
    const schemaErrors = buildResult.errors?.filter((e) => {
      // Ignore warnings
      const isHardError = !e.extensions?.warningLevel;
      const file = e.extensions?.file;
      if (!file) return isHardError;

      // Ignore operation (connector) errors, only keep schema errors
      const isSchemaFile = !serviceConfig.connectorDirs.some((dir) => {
        const absConnectorDir = path.resolve(serviceConfig.path, dir);
        const absFile = path.resolve(serviceConfig.path, file);
        return absFile.startsWith(absConnectorDir);
      });

      return isHardError && isSchemaFile;
    });

    if (schemaErrors?.length) {
      // Handle compilation errors and provide navigation to the file
      await handleCompilationError(schemaErrors[0], serviceConfig.path);
      return false;
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(
      "Ensure schema compiles before generating queries",
    );
    return false;
  }
  return true;
}

/**
 * Handles compilation errors by showing an error message and providing an option to open the file.
 * @param error The GraphQL error object.
 * @param servicePath The path to the service directory.
 */
async function handleCompilationError(
  error: GraphqlError,
  servicePath: string,
): Promise<void> {
  const message = `Schema compilation failed: ${error.message}`;
  const file = error.extensions?.file;
  const location = error.locations?.[0];

  if (file) {
    const fullPath = path.resolve(servicePath, file);
    const selection = await vscode.window.showErrorMessage(
      message,
      "Open File",
    );
    if (selection === "Open File") {
      const uri = vscode.Uri.file(fullPath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      if (location) {
        const pos = new vscode.Position(location.line - 1, location.column - 1);
        editor.revealRange(new vscode.Range(pos, pos));
        editor.selection = new vscode.Selection(pos, pos);
      }
    }
  } else {
    vscode.window.showErrorMessage(message);
  }
}
