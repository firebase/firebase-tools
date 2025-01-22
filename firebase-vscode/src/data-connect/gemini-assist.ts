import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { AnalyticsLogger } from "../analytics";
import { ExtensionBrokerImpl } from "../extension-broker";

export class GeminiAssistController {
  constructor(
    private readonly analyticsLogger: AnalyticsLogger,
    private readonly broker: ExtensionBrokerImpl,
  ) {
    this.registerCommands();
    this.registerBrokerHandlers(broker);
  }

  private registerCommands(): void {
    vscode.commands.registerCommand(
      "firebase.dataConnect.generateSchema",
      async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showWarningMessage("No active editor found.");
          return;
        }

        const documentPath = activeEditor.document.fileName;
        const documentText = activeEditor.document.getText();

        this.analyticsLogger.logger.logUsage("AI_GENERATE_SCHEMA");
        const userInput = await this.promptUserForInput("schema");
        if (!userInput) {
          vscode.window.showWarningMessage(
            "Operation cancelled: No input provided.",
          );
          return;
        }

        const gqlFiles = await this.collectGqlFiles("schema");
        const content = gqlFiles.map((filePath) =>
          fs.readFileSync(filePath, "utf-8"),
        );

        console.debug(`Total of ${gqlFiles.length} schema files found.`);

        // TODO: Send `content` and `userInput` to Gemini API
        vscode.window.showInformationMessage(
          `Schema generation initiated with input: ${userInput}`,
        );
      },
    );

    vscode.commands.registerCommand(
      "firebase.dataConnect.generateOperation",
      async (documentPath: string) => {
        this.analyticsLogger.logger.logUsage("AI_GENERATE_OPERATION");
        const userInput = await this.promptUserForInput("operation");
        if (!userInput) {
          vscode.window.showWarningMessage(
            "Operation cancelled: No input provided.",
          );
          return;
        }

        const gqlFiles = await this.collectGqlFiles("operation");
        const content = gqlFiles.map((filePath) =>
          fs.readFileSync(filePath, "utf-8"),
        );

        console.debug(`Total of ${gqlFiles.length} operation files found.`);

        // TODO: Send `content` and `userInput` to Gemini API
        vscode.window.showInformationMessage(
          `Operation generation initiated with input: ${userInput}`,
        );
      },
    );
  }

  private async collectGqlFiles(
    type: "schema" | "operation",
  ): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showWarningMessage("No workspace is open.");
      return [];
    }

    const gqlFiles: string[] = [];
    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      const files = await this.findGqlFiles(folderPath);

      for (const file of files) {
        if (type === "schema" && this.isSchemaFile(file)) {
          gqlFiles.push(file);
        } else if (type === "operation" && this.isOperationFile(file)) {
          gqlFiles.push(file);
        }
      }
    }

    return gqlFiles;
  }

  private async findGqlFiles(dir: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((file) => !file.isDirectory() && file.name.endsWith(".gql"))
      .map((file) => path.join(dir, file.name));

    const folders = entries.filter((folder) => folder.isDirectory());

    for (const folder of folders) {
      files.push(...(await this.findGqlFiles(path.join(dir, folder.name))));
    }

    return files;
  }

  private isSchemaFile(filePath: string): boolean {
    return filePath.toLowerCase().includes("schema");
  }

  private isOperationFile(filePath: string): boolean {
    return (
      filePath.toLowerCase().includes("mutations") ||
      filePath.toLowerCase().includes("queries")
    );
  }

  private registerBrokerHandlers(broker: ExtensionBrokerImpl): void {
    broker.on("fdc.generate-schema", async () => {
      try {
        await vscode.commands.executeCommand(
          "firebase.dataConnect.generateSchema",
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate schema: ${error}`);
      }
    });
  }

  private async promptUserForInput(
    promptType: string,
  ): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt: `Enter the prompt for AI ${promptType}`,
      placeHolder: `e.g., Generate a ${promptType.toLowerCase()} for a podcasting app`,
    });
  }

  dispose() {}
}
