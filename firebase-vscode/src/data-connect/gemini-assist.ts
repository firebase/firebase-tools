import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

import { AnalyticsLogger } from "../analytics";
import { ExtensionBrokerImpl } from "../extension-broker";

export class GeminiAssistController {
  constructor(
    private readonly analyticsLogger: AnalyticsLogger,
    private readonly broker: ExtensionBrokerImpl,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.registerCommands();
    this.registerBrokerHandlers(broker);

    this.context.subscriptions.push(
      vscode.window.registerCustomEditorProvider(
        "firebase.dataConnect.schemaEditor",
        new SchemaEditorProvider(this.context, this),
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
    if (gqlFiles.length === 0) {
      vscode.window.showWarningMessage(
        `No ${commandType} files found in the workspace.`,
      );
      return;
    }

    const gqlFilesString = JSON.stringify(gqlFiles);

    const viewTitle =
      (documentPath?.split("/").pop() || `new-${commandType}.gql`).split(
        ".",
      )[0] + "-generated";

    const viewUri = vscode.Uri.parse(
      `untitled:${viewTitle}.gql?${
        documentContent ? `content=${encodeURIComponent(documentContent)}` : ""
      }${documentPath ? `&path=${encodeURIComponent(documentPath)}&` : ""}${
        gqlFilesString ? `&context=${encodeURIComponent(gqlFilesString)}` : ""
      }`,
    );

    vscode.commands.executeCommand(
      "vscode.openWith",
      viewUri,
      "firebase.dataConnect.schemaEditor",
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

  async callGeminiApi(
    documentContent: string | undefined,
    documentContext: string[],
    prompt: string,
  ): Promise<string> {
    // TODO: Call Gemini API with the document content, schema content, and prompt
    try {
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

  private showTemporaryMessage(message: string): void {
    try {
      const disposable = vscode.window.setStatusBarMessage(message, 3000);
      setTimeout(() => disposable.dispose(), 3000);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show temporary message: ${error}`,
      );
    }
  }

  dispose() {}
}

class SchemaEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: GeminiAssistController,
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
            const generatedCode = await this.controller.callGeminiApi(
              documentContent,
              documentContext,
              prompt,
            );

            webviewPanel.webview.postMessage({
              command: "updateDocument",
              content: generatedCode,
            });
            break;
          }
          case "createNewFile": {
            const content = message.content;

            const fileName = await vscode.window.showInputBox({
              prompt: "Enter the file name",
            });

            if (fileName) {
              // If the document path is not provided, it means the user wants to create a new schema.
              // Get the schema directory which is usually in dataconnect/schema.
              if (
                !vscode.workspace.workspaceFolders ||
                vscode.workspace.workspaceFolders.length === 0
              ) {
                vscode.window.showErrorMessage("No workspace is open.");
                return;
              }
              const documentPath = !message.documentPath
                ? path.join(
                    vscode.workspace.workspaceFolders![0].uri.fsPath,
                    "dataconnect/schema",
                    fileName,
                  )
                : message.documentPath;

              const dir = path.dirname(documentPath);
              const newFileName = fileName.endsWith(".gql")
                ? fileName
                : `${fileName}.gql`;
              const newFilePath = path.join(dir, newFileName);

              if (fs.existsSync(newFilePath)) {
                vscode.window.showErrorMessage(
                  `File with name ${newFileName} already exists!`,
                );
              } else {
                const uri = vscode.Uri.file(newFilePath);
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
                vscode.window.showTextDocument(uri, {
                  viewColumn: vscode.ViewColumn.One,
                });
              }
            }
            break;
          }
          case "insertIntoExistingFile": {
            const content = message.content;
            const documentPath = message.documentPath;

            const originalUri = vscode.Uri.file(documentPath);
            const tempUri = vscode.Uri.file(path.join(os.tmpdir(), "temp.gql"));

            try {
              await vscode.workspace.fs.writeFile(
                tempUri,
                Buffer.from(content),
              );

              await vscode.commands.executeCommand<vscode.TextDocument>(
                "vscode.diff",
                originalUri,
                tempUri,
                "Original ↔ Proposed Changes",
                { viewColumn: vscode.ViewColumn.One },
              );

              const choice = await vscode.window.showInformationMessage(
                "Do you want to replace the original file?",
                "Replace",
                "Cancel",
              );

              if (choice === "Replace") {
                const originalDocument =
                  await vscode.workspace.openTextDocument(originalUri);
                const edit = new vscode.WorkspaceEdit();

                // Check if the active document is the diff, close it if it is
                if (
                  vscode.window.activeTextEditor?.document.uri.toString() ===
                  tempUri.toString()
                ) {
                  await vscode.commands.executeCommand(
                    "workbench.action.closeActiveEditor",
                    { save: false },
                  );
                }

                const fullRange = new vscode.Range(
                  originalDocument.positionAt(0),
                  originalDocument.positionAt(
                    originalDocument.getText().length,
                  ),
                );

                edit.replace(originalUri, fullRange, content);
                await vscode.workspace.applyEdit(edit);

                const editor = await vscode.window.showTextDocument(
                  originalUri,
                  {
                    viewColumn: vscode.ViewColumn.One,
                    selection: new vscode.Range(0, 0, 0, 0),
                  },
                );

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
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;

    // Use Highlight.js themes that closely match VS Code's default themes
    return isDarkTheme
      ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/vs2015.min.css" // Dark+ equivalent
      : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/vs.min.css"; // Light+ equivalent
  }

  private getWebviewContent(documentPath: string | undefined): string {
    const themeUrl = this.getHighlightJsThemeUrl();
    return `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Custom Editor</title>
  <link rel="stylesheet" href="${themeUrl}">
  <style>
    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      margin: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .title {
      font-size: var(--vscode-editor-font-size);
      font-weight: bold;
      margin-bottom: 16px;
    }

    textarea {
      width: 100%;
      height: 100px;
      max-height: 200px;
      padding: 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: vertical;
      box-sizing: border-box;
    }

    textarea:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    button {
      padding: 8px 16px;
      margin-top: 8px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      transition: background-color 0.1s ease-out;
    }

    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }

    button:active {
      background-color: var(--vscode-button-activeBackground);
    }

    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    button:focus {
      outline: none;
      background-color: var(--vscode-button-background);
    }

    .button-container {
      margin-bottom: 16px;
    }

    pre {
      margin: 0;
    }

    code.hljs {
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
    }

    .footer-buttons {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      justify-content: flex-start;
    }

    .hidden {
      display: none !important;
    }

    pre {
      position: relative;
      margin: 0;
      border-radius: 4px;
      background-color: var(--vscode-editor-background);
      overflow: auto;
    }

    .code-container {
      position: relative;
    }

    .copy-button {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      font-size: 12px;
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid var(--vscode-button-border);
      border-radius: 4px;
      cursor: pointer;
      opacity: 0.8;
    }

    .copy-button:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }

    .copy-button:focus {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
  </style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/languages/graphql.min.js"></script>
  <script>

  </script>
</head>
<body>
  <textarea id="input" placeholder="Enter your prompt"></textarea>

  <div class="button-container">
    <button id="generate">Generate</button>
  </div>

  <div class="code-container">
    <pre><code id="highlightedCode" class="language-graphql"></code><button id="copyButton" class="copy-button">Copy</button></pre>
  </div>
  
  <div class="footer-buttons hidden">
    ${
      documentPath
        ? '<button id="insert" class="button">Replace Existing File</button>'
        : ""
    }
    <button id="createNew" class="button">Create New File</button>
  </div>

  <script>
    const documentPath = "${documentPath}";
    let currentGeneratedContent = '';
    const vscode = acquireVsCodeApi();
    const generateButton = document.getElementById("generate");
    const copyButton = document.getElementById("copyButton");

    generateButton.addEventListener("click", () => {
      const input = document.getElementById("input").value;
      generateButton.disabled = true;
      generateButton.textContent = "Generating...";

      vscode.postMessage({
        command: "generateCode",
        input,
      });
    });

    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(currentGeneratedContent).then(() => {
        copyButton.textContent = "Copied!";
        setTimeout(() => copyButton.textContent = "Copy", 2000);
      });
    });

    document.getElementById("createNew").addEventListener("click", () => {
      if (!currentGeneratedContent) return;
      
      vscode.postMessage({
        command: "createNewFile",
        content: currentGeneratedContent,
        documentPath: documentPath
      });
    });

    if (document.getElementById("insert")) {
      document.getElementById("insert").addEventListener("click", () => {
        if (!currentGeneratedContent) return;
        
        vscode.postMessage({
          command: "insertIntoExistingFile",
          content: currentGeneratedContent,
          documentPath: documentPath
        });
      });
    }

    window.addEventListener("message", (event) => {
      if (event.data.command === "updateDocument") {
        generateButton.disabled = false;
        generateButton.textContent = "Generate";

        currentGeneratedContent = event.data.content;

        // Update the code block with highlighted content
        const codeBlock = document.getElementById("highlightedCode");
        codeBlock.innerHTML = currentGeneratedContent;

        // Re-apply syntax highlighting
        hljs.highlightElement(codeBlock);

        const footerButtons = document.querySelector('.footer-buttons');
        if (currentGeneratedContent.trim()) {
          footerButtons.classList.remove('hidden');
        } else {
          footerButtons.classList.add('hidden');
        }
      }
    });
  </script>
</body>
</html>

    `;
  }
}
