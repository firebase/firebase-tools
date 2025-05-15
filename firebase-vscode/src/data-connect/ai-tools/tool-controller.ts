import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Signal } from "@preact/signals-core";

import { Result } from "../../result";
import { AnalyticsLogger } from "../../analytics";
import { ResolvedDataConnectConfigs } from "../config";
import { DataConnectService } from "../service";
import { CloudAICompanionResponse, ChatMessage } from "../../dataconnect/cloudAICompanionTypes";
import { ObjectTypeDefinitionNode, OperationDefinitionNode } from "graphql";
import { getHighlightedText, findGqlFiles } from "../file-utils";
import { CommandContext, Chat, Context, Command, BackendAuthor } from "./types";
import { DATA_CONNECT_EVENT_NAME } from "../../analytics";

const USER_PREAMBLE = "This is the user's prompt: \n";

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
    private readonly fdcService: DataConnectService,
    private configs: Signal<
      Result<ResolvedDataConnectConfigs | undefined> | undefined
    >,
  ) {
    this.registerCommands();
  }

  // entry points from vscode to respsective tools
  private registerCommands(): void {
    /** Demo only */
    // vscode.commands.registerCommand(
    //   "firebase.dataConnect.refineOperation",
    //   async (ast: ObjectTypeDefinitionNode) => {
    //     this.highlightActiveType(ast);
    //     if (env.value.isMonospace) {
    //       vscode.commands.executeCommand("aichat.prompt", {
    //         prefillPrompt: "@data-connect /generate_operation ",
    //       });
    //     } else {
    //       // change to prefill when GCA releases feature
    //       vscode.commands.executeCommand("cloudcode.gemini.chatView.focus");
    //     }
    //   },
    // );
    /** End Demo only */
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
      this.analyticsLogger.logger.logUsage(
        DATA_CONNECT_EVENT_NAME.GEMINI_OPERATION_CALL,
      );
    } else if (command === Command.GENERATE_SCHEMA) {
      type = "schema";
      this.analyticsLogger.logger.logUsage(
        DATA_CONNECT_EVENT_NAME.GEMINI_SCHEMA_CALL,
      );
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

    if (resp.error) {
      this.analyticsLogger.logger.logUsage(
        DATA_CONNECT_EVENT_NAME.GEMINI_ERROR,
      );
      return [{ author: "MODEL", content: resp.error.message }];
    }

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

      if (!service) {
        // The entrypoint is not a codelens file, so we can't determine the service.
        return "";
      }

      let schema: string = "";
      const schemaPath = path.join(service.path, service.schemaDir);
      const schemaFiles = await findGqlFiles(schemaPath);
      for (const file of schemaFiles) {
        schema = schema.concat(fs.readFileSync(file, "utf-8"));
      }
      return schema;
    } catch (error) {
      throw new Error(`Failed to collect GQL files: ${error}`);
    }
  }

  /** Demo usage only */
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

  private isAuthorBackend(author: string) {
    return Object.values(BackendAuthor).includes(author);
  }

  // checks if last chat in the history is a generated code response from a model
  private isLastChatGenerated(chatHistory: Chat[]): boolean {
    const lastChat = chatHistory.pop();
    return (
      lastChat !== undefined &&
      this.isAuthorBackend(lastChat.author) &&
      lastChat.commandContext !== undefined &&
      lastChat.commandContext !== CommandContext.NO_OP
    );
  }

  /** End demo code */

  dispose() {}
}
