import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Signal } from "@preact/signals-core";

import { Result } from "../../result";
import { AnalyticsLogger } from "../../analytics";
import { ResolvedDataConnectConfigs } from "../config";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { DataConnectService } from "../service";
import { pluginLogger as logger } from "../../logger-wrapper";
import { CloudAICompanionResponse, ChatMessage } from "../../dataconnect/types";
import { ChatContext } from "./gca-tool-types";
import { ObjectTypeDefinitionNode, OperationDefinitionNode } from "graphql";
import { getHighlightedText } from "../file-utils";
import { CommandContext, Chat, Context, Command, BackendAuthor } from "./types";
import { env } from "../../core/env";

const USER_PREAMBLE = "This is the user's prompt: \n";
const USER_REFINE_PREAMBLE =
  "This is the modification the user would like to make: \n";

const SCHEMA_PROMPT_PREAMBLE =
  "This is the user's current schema in their code base.: \n";

const NEW_LINE = "\n";
const HIGHLIGHTED_TEXT_PREAMBLE =
  "This is the highlighted code in the users active editor: \n";

/**
 * Logic for talking to CloudCompanion API
 * Handles Context collection and management
 *
 */
export class GeminiToolController {
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
  }

  // entry points from vscode to respsective tools
  private registerCommands(): void {
    vscode.commands.registerCommand(
      "firebase.dataConnect.refineOperation",
      async (ast: ObjectTypeDefinitionNode) => {
        this.highlightActiveType(ast);
        if (env.value.isMonospace) {
          vscode.commands.executeCommand("aichat.prompt", {
            prefillPrompt: "@dataconnect /generate_operation ",
          });
        } else {
          // change to prefill when GCA releases feature
          vscode.commands.executeCommand("cloudcode.gemini.chatView.focus");
        }
      },
    );
  }
  private highlightActiveType(ast: ObjectTypeDefinitionNode) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !ast.loc) {
      // TODO: add a warning, and skip this process
    } else {
      // highlight the schema in question
      const startPostion = new vscode.Position(
        ast.loc?.startToken.line - 1,
        ast.loc?.startToken.column - 1,
      );
      const endPosition = new vscode.Position(
        ast.loc?.endToken.line,
        ast.loc?.endToken.column - 1,
      );
      editor.selection = new vscode.Selection(startPostion, endPosition);
    }
  }

  /**
   * Entry point to chat interface;
   * Builds prompt given chatHistory and generation type
   * We use some basic heuristics such as
   *    - presence of previously generated code
   *    - activeEditor + any highlighted code
   */
  public async handleChat(
    userPrompt: string, // prompt without toolname and command
    chatHistory: Chat[],
    command: Command,
  ): Promise<ChatMessage[]> {
    let prompt = "";
    let currentChat: Chat = {
      author: "USER",
      content: "to_be_set",
      commandContext: CommandContext.NO_OP /* to be set */,
    };
    let type: "schema" | "operation";

    // set type
    if (command === Command.GENERATE_OPERATION) {
      type = "operation";
    } else if (command === Command.GENERATE_SCHEMA) {
      type = "schema";
    } else {
      // undetermined process
      chatHistory.push({
        author: "MODEL",
        content:
          "Gemini is unable to complete that request. Try '/generate_schema' or '/generate_operation' to get started.",
      });
      return chatHistory;
    }

    //TODO: deal with non-open editor situation
    const currentDocumentPath =
      vscode.window.activeTextEditor?.document.uri.path;

    // get additional context
    const schema = await this.collectSchemaText();
    const highlighted = getHighlightedText();

    // check if highlighted is a single operation
    if (highlighted) {
      prompt = prompt.concat(HIGHLIGHTED_TEXT_PREAMBLE, highlighted);
    }

    // only add schema for operation generation
    if (schema && command === Command.GENERATE_OPERATION) {
      prompt = prompt.concat(SCHEMA_PROMPT_PREAMBLE, schema);
    }

    // finalize prompt w/ user prompt
    prompt = prompt.concat(USER_PREAMBLE, userPrompt);

    const resp = await this.callGenerateApi(
      currentDocumentPath || "",
      prompt,
      type,
      this.cleanHistory(chatHistory, type),
    );

    return resp.output.messages;
  }

  // clean history for API consumption
  public cleanHistory(history: ChatMessage[], type: string): Chat[] {
    if (type === "operation") {
      // operation api uses "SYSTEM" to represent API responses
      return history.map((item) => {
        if (
          item.author.toUpperCase() === "MODEL" ||
          item.author.toUpperCase() === "AGENT"
        ) {
          item.author = "SYSTEM";
        }

        if (item.author.toUpperCase() === "USER") {
          item.author = "USER"; // set upper case
        }
        // remove command context
        return { author: item.author, content: item.content };
      });
    } else {
      return history.map((item) => {
        if (
          item.author.toUpperCase() === "AGENT" ||
          item.author.toUpperCase() === "SYSTEM"
        ) {
          item.author = "MODEL";
        }
        item.author = item.author.toUpperCase();

        return {
          author: item.author,
          content: item.content,
        };
      });
    }
  }

  public async handleSchema(prompt: string, chatHistory: Chat[]) {}

  private async setupRefineOperation(prompt: string, chatHistory: Chat[]) {
    const preamble =
      "This is the GraphQL Operation that was generated previously: ";

    // TODO: more verification
    const lastChat = chatHistory.pop();
    let operation = "";
    if (!lastChat) {
      // could not find an operation, TODO: response appropriately
    } else {
      operation = lastChat.content;
    }

    return preamble.concat(NEW_LINE, operation);
  }

  private async setupRefineSchema(prompt: string, chatHistory: Chat[]) {
    const SCHEMA_PREAMBLE =
      "This is the GraphQL Schema that was generated previously: \n";

    // TODO: more verification
    const lastChat = chatHistory.pop();
    let schema = "";
    if (!lastChat) {
      // could not find a schema, use the schema in editor
      schema = await this.collectSchemaText();
    } else {
      schema = lastChat.content;
    }

    return prompt.concat(SCHEMA_PREAMBLE, schema);
  }

  // checks if last chat in the history is a generated code response from a model
  private isLastChatGenerated(chatHistory: Chat[]): boolean {
    const lastChat = chatHistory.pop();
    return (
      lastChat !== undefined &&
      isAuthorBackend(lastChat.author) &&
      lastChat.commandContext !== undefined &&
      lastChat.commandContext !== CommandContext.NO_OP
    );
  }

  private async setupModifyExistingSchema(
    prompt: string,
    chatHistory: Chat[],
  ) {}

  async callGenerateApi(
    documentPath: string,
    prompt: string,
    type: "schema" | "operation",
    chatHistory: Chat[],
  ): Promise<CloudAICompanionResponse> {
    // TODO: Call Gemini API with the document content and context
    try {
      const response = await this.fdcService.generateOperation(
        documentPath,
        prompt,
        type,
        chatHistory,
      );
      if (!response) {
        throw new Error("No response from Cloud AI API");
      }
      return response;
    } catch (error) {
      throw new Error(`Failed to call Gemini API: ${error}`);
    }
  }

  async collectSchemaText(): Promise<string> {
    try {
      const service = this.configs?.value?.tryReadValue?.values[0];
      console.log(service);

      if (!service) {
        // The entrypoint is not a codelens file, so we can't determine the service.
        return "";
      }

      let schema: string = "";
      const schemaPath = path.join(service.path, service.schemaDir);
      console.log("PATH: ", schemaPath);
      const schemaFiles = await this.findGqlFiles(schemaPath);
      console.log(schemaFiles);
      for (const file of schemaFiles) {
        schema = schema.concat(fs.readFileSync(file, "utf-8"));
      }
      console.log("SCHEMA: ", schema);
      return schema;
    } catch (error) {
      throw new Error(`Failed to collect GQL files: ${error}`);
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
        vscode.commands.executeCommand("cloudcode.duetAI.sendTransformToChat");

        // this.generationEntrypoint(type, undefined, undefined);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate schema: ${error}`);
      }
    });
  }

  dispose() {}
}

function isAuthorBackend(author: string) {
  return Object.values(BackendAuthor).includes(author);
}
