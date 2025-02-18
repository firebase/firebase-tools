import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { Signal } from "@preact/signals-core";

// @ts-ignore
import customEditorTemplate from "./custom-editor.html";

import { Result } from "../result";
import { AnalyticsLogger } from "../analytics";
import { ResolvedDataConnectConfigs } from "./config";
import { ExtensionBrokerImpl } from "../extension-broker";
import { DataConnectService } from "./service";

export class GeminiAssistController {
  constructor(
    private readonly analyticsLogger: AnalyticsLogger,
    private readonly broker: ExtensionBrokerImpl,
    private readonly context: vscode.ExtensionContext,
    private readonly fdcService: DataConnectService,
    private configs: Signal<
      Result<ResolvedDataConnectConfigs | undefined> | undefined
    >,
  ) {
    this.registerCommands();
    this.registerBrokerHandlers(broker);

    this.context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(
        "firebase.dataConnect.geminiEditor",
        new GeminiEditorProvider(this.context, this, configs),
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
          supportsMultipleEditorsPerDocument: false,
        },
      ),
    );
  }

  private registerCommands(): void {
    vscode.commands.registerCommand(
      "firebase.dataConnect.generateSchema",
      async (documentContent: string, documentPath: string) =>
        this.generationEntrypoint("schema", documentContent, documentPath),
    );

    vscode.commands.registerCommand(
      "firebase.dataConnect.generateOperation",
      async (documentContent: string, documentPath: string) =>
        this.generationEntrypoint("operation", documentContent, documentPath),
    );
  }

  private async generationEntrypoint(
    commandType: "operation" | "schema",
    documentContent: string | undefined,
    documentPath: string | undefined,
  ): Promise<void> {
    const gqlFiles = await this.collectGqlFiles(commandType);
    const gqlFilesString = gqlFiles.length > 0 ? JSON.stringify(gqlFiles) : "";

    const customEditorTitle =
      (documentPath?.split("/").pop() || `new-${commandType}.gql`).split(
        ".",
      )[0] + "-generated";

    // To create a new editor that is not associated with a file, we use the `untitled` scheme.
    // To pass data to the editor, since it's a webview, we use the query string.
    const customEditorUri = vscode.Uri.parse(
      `untitled:${customEditorTitle}.gql?${
        documentContent ? `content=${encodeURIComponent(documentContent)}` : ""
      }${documentPath ? `&path=${encodeURIComponent(documentPath)}&` : ""}${
        gqlFilesString ? `&context=${encodeURIComponent(gqlFilesString)}` : ""
      }`,
    );

    vscode.commands.executeCommand(
      "vscode.openWith",
      customEditorUri,
      "firebase.dataConnect.geminiEditor",
      documentPath ? vscode.ViewColumn.Beside : vscode.ViewColumn.One,
    );
  }

  private async formatCodeWithVSCode(content: string): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `temp.graphql`);
    fs.writeFileSync(tempFilePath, content);

    const tempUri = vscode.Uri.file(tempFilePath);

    try {
      const tempDocument = await vscode.workspace.openTextDocument(tempUri);

      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        "vscode.executeFormatDocumentProvider",
        tempDocument.uri,
      );

      if (edits && edits.length > 0) {
        let formattedContent = content;

        for (const edit of edits.reverse()) {
          const startOffset = tempDocument.offsetAt(edit.range.start);
          const endOffset = tempDocument.offsetAt(edit.range.end);

          formattedContent =
            formattedContent.substring(0, startOffset) +
            edit.newText +
            formattedContent.substring(endOffset);
        }

        return formattedContent;
      }

      return content;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  async callGenerateApi(
    documentContent: string | undefined,
    documentContext: string[],
    documentPath: string,
    prompt: string,
  ): Promise<string> {
    // TODO: Call Gemini API with the document content, schema content, and prompt
    try {
      this.fdcService.generateOperation(documentPath, prompt);
      const response = `
        query getPost($id: String!) @auth(level: PUBLIC) {
          post(id: $id) {
            content
            comments: comments_on_post {
              id
              content
            }
          }
        }

        query listPostsForUser($userId: String!) @auth(level: PUBLIC) {
          posts(where: { id: { eq: $userId } }) {
            id
            content
          }
        }

        query listPostsOnlyId @auth(level: PUBLIC) {
          posts {
            id
          }
        }
      `;

      // Sleep for 1 second to simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return this.formatCodeWithVSCode(response);
    } catch (error) {
      throw new Error(`Failed to call Gemini API: ${error}`);
    }
  }

  async collectGqlFiles(type: "schema" | "operation"): Promise<string[]> {
    try {
      const service =
        this.configs?.value?.tryReadValue?.findEnclosingServiceForPath(
          vscode.window.activeTextEditor?.document.uri.fsPath || "",
        );

      if (!service) {
        // The entrypoint is not a codelens file, so we can't determine the service.
        return [];
      }

      const gqlFiles: string[] = [];
      const activeDocumentConnector = service.findEnclosingConnectorForPath(
        vscode.window.activeTextEditor?.document.uri.fsPath || "",
      );

      switch (type) {
        case "operation":
          const files = await this.findGqlFiles(
            activeDocumentConnector?.path || "",
          );

          for (const file of files) {
            gqlFiles.push(file);
          }
          break;
        case "schema":
          const schemaPath = path.join(service.path, service.schemaDir);
          const schemaFiles = await this.findGqlFiles(schemaPath);

          for (const file of schemaFiles) {
            gqlFiles.push(file);
          }
          break;
      }

      return gqlFiles || [];
    } catch (error) {
      throw new Error(`Failed to collect GQL files: ${error}`);
    }
  }

  private async findGqlFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const files = entries
        .filter((file) => !file.isDirectory() && file.name.endsWith(".gql"))
        .map((file) => path.join(dir, file.name));

      const folders = entries.filter((folder) => folder.isDirectory());

      for (const folder of folders) {
        files.push(...(await this.findGqlFiles(path.join(dir, folder.name))));
      }

      return files;
    } catch (error) {
      throw new Error(`Failed to find GQL files: ${error}`);
    }
  }

  private isSchemaFile(filePath: string): boolean {
    try {
      return filePath.toLowerCase().includes("schema");
    } catch (error) {
      throw new Error(`Failed to check if file is a schema file: ${error}`);
    }
  }

  private isOperationFile(filePath: string): boolean {
    try {
      return (
        filePath.toLowerCase().includes("mutations") ||
        filePath.toLowerCase().includes("queries")
      );
    } catch (error) {
      throw new Error(`Failed to check if file is an operation file: ${error}`);
    }
  }

  private registerBrokerHandlers(broker: ExtensionBrokerImpl): void {
    broker.on("fdc.generate-schema", async (args) => {
      const { type } = args;
      try {
        this.generationEntrypoint(type, undefined, undefined);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate schema: ${error}`);
      }
    });
  }

  dispose() {}
}

class GeminiEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: GeminiAssistController,
    private configs: Signal<
      Result<ResolvedDataConnectConfigs | undefined> | undefined
    >,
  ) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const query = new URLSearchParams(document.uri.query);
    const documentContent = query.get("content") || "";
    const documentContext = JSON.parse(
      query.get("context") || "[]",
    ) as string[];
    const documentPath = query.get("path") || "";

    webviewPanel.webview.html = this.getWebviewContent(documentPath);

    webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "generateCode": {
            const prompt = message.input;
            const generatedCode = await this.controller.callGenerateApi(
              documentContent,
              documentContext,
              documentPath,
              prompt,
            );

            webviewPanel.webview.postMessage({
              command: "updateDocument",
              content: generatedCode,
            });
            break;
          }
          case "createNewFile": {
            this.createNewFile(message);
            break;
          }
          case "insertIntoExistingFile": {
            await this.insertIntoExistingFile(message);
            break;
          }
        }
      },
      undefined,
      this.context.subscriptions,
    );

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() === document.uri.toString()) {
          webviewPanel.webview.postMessage({
            command: "update",
            content: document.getText(),
          });
        }
      },
    );

    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
    });
  }

  private getHighlightJsThemeUrl(): string {
    // Check if the current VS Code theme is dark or light
    const isDarkTheme =
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
      vscode.window.activeColorTheme.kind ===
        vscode.ColorThemeKind.HighContrast;

    // Use Highlight.js themes that closely match VS Code's default themes
    return isDarkTheme
      ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/vs2015.min.css" // Dark+ equivalent
      : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/vs.min.css"; // Light+ equivalent
  }

  private getWebviewContent(documentPath: string | undefined): string {
    const themeUrl = this.getHighlightJsThemeUrl();
    return customEditorTemplate
      .replace("{{themeUrl}}", themeUrl)
      .replace("{{documentPath}}", documentPath || "");
  }

  private async createNewFile(message: any): Promise<void> {
    const service =
      this.configs?.value?.tryReadValue?.findEnclosingServiceForPath(
        vscode.window.activeTextEditor?.document.uri.fsPath || "",
      );

    const content = message.content;
    let documentPath = message.documentPath;

    const fileName = await vscode.window.showInputBox({
      prompt: "Enter the file name",
    });

    if (fileName) {
      if (!documentPath) {
        // If no documetPath is provided, use the schema directory
        documentPath = path.join(
          vscode.workspace.workspaceFolders?.[0].uri.fsPath || "",
          "dataconnect",
          "schema",
        );
      }

      const newFileName = fileName.endsWith(".gql")
        ? fileName
        : `${fileName}.gql`;
      const newFilePath = path.join(documentPath, newFileName);

      if (fs.existsSync(newFilePath)) {
        vscode.window.showErrorMessage(
          `File with name ${newFileName} already exists!`,
        );
        return;
      }

      const uri = vscode.Uri.file(newFilePath);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
      vscode.window.showTextDocument(uri, {
        viewColumn: vscode.ViewColumn.One,
      });
    }
  }

  private async insertIntoExistingFile(message: any): Promise<void> {
    const content = message.content;
    const documentPath = message.documentPath;

    const edit = new vscode.WorkspaceEdit();

    const originalUri = vscode.Uri.file(documentPath);
    const originalContent = await vscode.workspace.fs.readFile(originalUri);
    const tempUri = vscode.Uri.file(path.join(os.tmpdir(), "temp.gql"));

    try {
      // 1. Read original file content, append the generated content, and show diff view
      fs.writeFileSync(
        tempUri.fsPath,
        Buffer.concat([originalContent, Buffer.from(content)]),
      );

      await vscode.commands.executeCommand<vscode.TextDocument>(
        "vscode.diff",
        originalUri,
        tempUri,
        "Original ↔ Proposed Changes",
        { viewColumn: vscode.ViewColumn.One },
      );

      const choice = await vscode.window.showInformationMessage(
        "Do you want to append the generated GQL to the original file?",
        "Append",
        "Cancel",
      );

      if (choice === "Append") {
        const originalDocument =
          await vscode.workspace.openTextDocument(originalUri);

        if (
          vscode.window.activeTextEditor?.document.uri.toString() ===
          tempUri.toString()
        ) {
          await vscode.commands.executeCommand(
            "workbench.action.closeActiveEditor",
            { save: false },
          );
        }

        edit.insert(
          originalUri,
          new vscode.Position(originalDocument.lineCount + 1, 0),
          content,
        );
        await vscode.workspace.applyEdit(edit);

        const editor = await vscode.window.showTextDocument(originalUri, {
          viewColumn: vscode.ViewColumn.One,
          selection: new vscode.Range(0, 0, 0, 0),
        });

        editor.revealRange(
          new vscode.Range(0, 0, 0, 0),
          vscode.TextEditorRevealType.AtTop,
        );
      }
    } finally {
      try {
        if (await vscode.workspace.fs.stat(tempUri)) {
          await vscode.workspace.fs.delete(tempUri, {
            useTrash: false,
          });
        }
      } catch (error) {
        console.error("Error cleaning up temp file:", error);
      }
    }
  }
}
