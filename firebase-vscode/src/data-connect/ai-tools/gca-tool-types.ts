import {
  CancellationToken,
  Disposable,
  MarkdownString,
  ThemeIcon,
  Uri,
} from "vscode";

/**
 * The public API for Gemini Code Assist to be utilized by external providers to
 * extend Gemini Code Assist functionality.
 */
export interface GeminiCodeAssist extends Disposable {
  /**
   * Registers the caller as a tool for Gemini Code Assist.  The tool will be
   * identified to the end user through the id parameter. The tool will further
   * identify itself through the extension id.  An extension may choose to
   * register any number of tools.
   * @param id The id to use when referring to the tool.  For example this may
   * be `gemini` so that the tool will be addressed as `@gemini` by the user.
   * Note that this id cannot be reused by another tool or other entity like
   * a variable provider.
   * @param displayName The name of the tool, to be used when referring to the
   * tool in chat.
   * @param extensionId The extension that implements the tool.  The tool's
   * icon will be loaded from this extension by default and used when
   * displaying the tool's participation in chat.
   * @param iconPath The path to the tool's icon, can be an icon for any theme,
   * contain a dark and light icon or be a ThemeIcon type. The iconPath should be a join
   * of the extension path and the relative path to the icon.
   * @param command A command for Gemini Code Assist to execute on activation.
   * If this is specified by the tool registration Gemini Code Assist will wait
   * for the tool's extension to activate and then execute the command
   * specified.  This can be used to allow the tool to guarantee registration
   * whenever Gemini Code Assist is loaded.
   * @return The tool's registration to be modified by the tool provider with
   * the capabilities of the tool.
   */
  registerTool(
    id: string,
    displayName: string,
    extensionId: string,
    iconPath?: Uri | { dark: Uri; light: Uri } | ThemeIcon,
    command?: string,
  ): GeminiTool;
}

/**
 * Represents a tool to Gemini Code Assist.  This allows the external provider
 * to provide specific services to Gemini Code Assist.  Upon dispose this tool
 * registration will be removed from Gemini Code Assist for this instance only.
 * Upon subsequent activations Gemini Code Assist will attempt to execute the
 * command that was specified in the tool's registration if any was specified.
 */
export interface GeminiTool extends Disposable {
  /**
   * Registers a handler for chat.  This allows the tool to handle incoming
   * chat requests.
   * @param handler The chat handler method that will be called with the
   * registered tool is called.
   * @return Disposable for subscription purposes, calling dispose will remove
   * the registration.
   */
  registerChatHandler(handler: ChatHandler): Disposable;

  /**
   * Registers a variable provider for the tool.  Variable provider ids should
   * be unique for the tool but other tools may choose to implement the same
   * provider id.  For example `@bug` could be registered to `@jira` and
   * `@github`.
   * @param id The variable provider id, used to isolate typeahead to a specific
   * variable type.  For example using `@bug` will allow users to limit
   * typeahead to bugs only instead of anything that can be completed.
   * @param provider The provider to register, this will provide both static
   * resolution as well as dynamic resolution.
   * @return Disposable for removing the variable provider from Gemini Code
   * Assist.
   */
  registerVariableProvider(id: string, provider: VariableProvider): Disposable;

  /**
   * Registers a slash command provider for the tool.  This allows the tool
   * to provide slash commands for the user.  For example `/list` can be
   * registered to the `@jira` tool to list bugs assigned to the user.
   * @param provider The slash command provider to be registered.
   * @return Disposable for removing the command provider from Gemini Code
   * Assist.
   */
  registerCommandProvider(provider: CommandProvider): Disposable;

  /**
   * Registers a suggested prompt provider for the tool.  This allows the tool
   * to provide suggestions of prompts that the user can either tab complete or
   * click to use.
   * @param provider The child provider to be registered.
   * @return Disposable for removing the suggested prompt provider from Gemini
   * Code Assist.
   */
  registerSuggestedPromptProvider(
    provider: SuggestedPromptProvider,
  ): Disposable;
}

/**
 * Provides suggested prompts which serve as example queries for the tool.
 * These suggested prompts allow the user to see specific examples when using
 * the tool and give some guidance as to helpful prompts as a starting point for
 * using the tool with Gemini Code Assist.
 */
export interface SuggestedPromptProvider {
  /**
   * Provides a list of suggested prompts for the tool that will be displayed to
   * the user as examples or templates for using the tool.  In this text the
   * user can specify placeholder text as text surrounded by square brackets.
   * For example a suggested prompt value of `/generate an api specification for
   * [function]` provided by `apigee` would provide a suggested prompt of
   * `@apigee /generate an api specification for [function]` and the user would
   * be prompted to supply a value for the [function] placeholder.
   */
  provideSuggestedPrompts(): string[];
}

/**
 * Provides the chat handler functionality to Gemini Code Assist, allowing a
 * tool to extend chat.  Through this handler the tool can service chat
 * requests, add context for Gemini chat requests, and/or rewrite the prompt
 * before it is sent to the LLM service.
 */
export interface ChatHandler {
  /**
   * @param request The chat request, can be used to manipulate the prompt and
   * reference parts.
   */
  (
    request: ChatRequest,
    responseStream: ChatResponseStream,
    token: CancellationToken,
  ): Promise<void>;
}

/**
 * Provides support for variables through the `@` designator.  For example
 * `@repo` could represent the current repository for a SCM tool.  This
 * interface allows the tool to provide a static list of variables as well as
 * a dynamic list.
 */
export interface VariableProvider {
  /**
   * Allows the tool to return a static list of variables that it supports.
   * This list is not expected to change as the user is typing.
   * @return Returns a list of variables instances.
   */
  listVariables(): Promise<Variable[]>;

  /**
   * Allows for dynamic variable support.  This function will allow the tool
   * to resolve variables as the user types.
   * @param part Current text part that the user has typed, this is what
   * currently follows the `@` symbol in the user's prompt.
   * @param limit The number of typeahead suggestions that the UI will show to
   * the user at once.
   * @param token Supports cancellation (user types an additional character).
   * @return Returns a list of variable instances that match the type ahead.
   */
  typeahead(
    part: string,
    limit: number,
    token: CancellationToken,
  ): Promise<Variable[]>;
}

/**
 * Represents a variable instance, the name and description are used to display
 * the variable to the user.  The variable instance will be passed as is to the
 * tool, so it can carry any additional context necessary.
 */
export interface Variable {
  /**
   * The name of the variable, this would be what the variable looks like to the
   * user.
   */
  name: string;

  /**
   * The optional description of the variable to show the user in the UX.
   */
  description?: string | MarkdownString;
}

/**
 * Provides support for commands through the `/` designator.  This takes the
 * form of `@tool /command`.
 */
export interface CommandProvider {
  /**
   * Lists the slash commands provided by the tool.
   * @return Command gives a list of the commands provided by the tool.
   */
  listCommands(): Promise<CommandDetail[]>;
}

/**
 * CommandDetail exports a command along with any other context the tool may
 * want to have in coordination with the command.
 */
export interface CommandDetail {
  /**
   * The string that identifies the command in question.
   */
  command: string;

  /**
   * The optional description of the slash command to display to the user.
   */
  description?: string | MarkdownString;

  /**
   * The optional codicon of the slash command.
   */
  icon?: string;
}

/**
 * CommandPromptPart is the part of the prompt that is associated with a slash
 * command.
 */
export interface CommandPromptPart extends PromptPart {
  /**
   * The CommandDetail provided by the CommandProvider's listCommands()
   * function.
   */
  command: CommandDetail;
}

/**
 * Provides the context for the chat request.  The context can be used to
 * provide additional information to the LLM service.
 */
export interface ChatRequestContext {
  /**
   * Pushes a new context onto the context stack.
   * @param context The context to push.
   */
  push(context: ChatContext | VariableChatContext): void;
}

/**
 * Represents a context that can be used to provide additional information to the
 * LLM service.
 */
export interface ChatContext {
  /**
   * The id of the reference that this context is associated with.
   */
  id: string | Uri;

  /**
   * Gets the text of the context.
   */
  getText(): string;
}

/**
 * Represents a context for a variable in the prompt.
 */
export interface VariableChatContext extends ChatContext {
  /**
   * The variable that this context represents.
   */
  variable: Variable;
}

/**
 * Represents a chat request which is comprised of a prompt and context.
 */
export interface ChatRequest {
  /**
   * The prompt of the chat request.  This can be manipulated by the tool.
   */
  prompt: ChatPrompt;

  /**
   * The context for the request.  This can be used by the tool to add context
   * to the request.
   */
  context: ChatRequestContext;
}

/**
 * Represents the current chat prompt.
 */
export interface ChatPrompt {
  /**
   * Used to retrieve all parts of the prompt, including the tool prompts.
   * @return An array of all parts of the prompt in order that they appear.
   */
  getPromptParts(): PromptPart[];

  /**
   * Removes the specified prompt part.
   * @param part The prompt part to remove.
   */
  deletePromptPart(part: PromptPart): void;

  /**
   * Splices in prompt part(s) similarly to Array.splice().  This can be used to
   * insert a number of prompt part(s) (including none) and can remove existing
   * elements.
   * @param index The starting index for the splice operation.
   * @param remove The number of elements to remove.
   * @param parts The prompt part(s) to insert.
   */
  splice(index: number, remove: number, ...parts: PromptPart[]): void;

  /**
   * Pushes the prompt part(s) into the chat prompt.  These part(s) are appended
   * similarly to array.push().
   * @param parts The prompt part(s) to push.
   */
  push(...parts: PromptPart[]): void;

  /**
   * Returns the string representation of the prompt.
   */
  fullPrompt(): string;

  /**
   * The length of the prompt in parts.
   */
  length: number;
}

/**
 * Represents a prompt part that is provided by a tool.
 */
export interface PromptPart {
  /**
   * Gets the prompt of the prompt part.
   */
  getPrompt(): string;
}

/**
 * Represents a prompt part that is provided by a tool.
 */
export interface ToolPromptPart extends PromptPart {
  /**
   * The id of the tool that provided the prompt part.
   */
  toolId: string;

  /**
   * The command of the prompt part.
   */
  command: string;
}

/**
 * Represents a prompt part that refers to a variable.
 */
export interface VariablePromptPart extends PromptPart {
  variable: Variable;
}

/**
 * Represents a stream of chat responses.  Used by the tool to provide chat
 * based responses to the user.  This stream can be used to push both partial
 * responses as well as to close the stream.
 */
export interface ChatResponseStream {
  /**
   * Pushes a new content onto the response stream.
   * @param content The content to push.
   */
  push(content: MarkdownString | Citation): void;

  /**
   * Closes the steam and prevents the request from going to the LLM after tool
   * processing.  This can be utilized by the client for commands that are
   * client only.  Returning without calling close will result in the processed
   * prompt and context being sent to the LLM for a result.
   */
  close(): void;

  /**
   * Adds a button handler to code responses that come back from the LLM.  This
   * allows the tool to present the user with a button attached to this response
   * and on click process the code response.
   * @param title The title of the button.
   * @param handler The handler to execute when the user clicks on the button.
   * The code block will be sent as an argument to the handler on execution as
   * CodeHandlerCommandArgs.
   * @param languageFilter Optional parameter, if this is specified the
   * language specified on the block will be checked for a match against this
   * and the button will be displayed on match.  If this is not specified the
   * buttone will be displayed on any language result.
   */
  addCodeHandlerButton(
    title: string,
    handler: CodeHandler,
    options: HandlerButtonOptions,
  ): void;
}

/**
 * Method for handling code responses from the LLM attached to the response via
 * ChatResponseStream.addCodeHandlerButton.
 */
export interface CodeHandler {
  /**
   * @param args The code block and language specifiers from the LLM response to
   * handle.  Called when the user clicks on a CodeHandlerButton.
   */
  (args: CodeHandlerCommandArgs): void;
}

/**
 * The arguments that are sent when calling the command associated with the
 * addCodeHandlerButton method.
 */
export interface CodeHandlerCommandArgs {
  /**
   * The code block that was attached to the code handler button.
   */
  codeBlock: string;
  /**
   * The language specifier on the code block associated with the code handler
   * button.
   */
  language: string;
}

/**
 * Provides options for a code handler button.  This allows the tool to
 * specialize the way GCA handles specific code blocks when the agent is
 * involved.
 */
export interface HandlerButtonOptions {
  /**
   * Optional parameter, if this is specified the language specified on the
   * block will be checked for a match against this and the button will be
   * displayed on match.  If this is not specified the button will be displayed
   * on any language result.
   */
  languages?: RegExp;

  /**
   * Optional, if this is specified the block will be either expanded or
   * collapsed as specified.  If this is not specified the built in default
   * handler will be used.
   */
  displayType?: BlockDisplayType;
}

/**
 * Specifies how code blocks should be handled in chat.
 */
export enum BlockDisplayType {
  /**
   * The code block will be expanded by default.
   */
  Expanded,

  /**
   * The code block will be collapsed by default.
   */
  Collapsed,
}

/**
 * Represents the type of citation.
 */
export enum CitationType {
  /**
   * General citation where the link is from a unspecific source.
   */
  Unknown,

  /**
   * The citation originates from the user's machine, for example a file on the
   * user's disk.
   */
  Local,

  /**
   * The citation comes from Github.
   */
  Github,
}

/**
 * Represents a citation.
 */
export interface Citation {
  /**
   * The URI of the citation.
   */
  uri: Uri;

  /**
   * The license of the citation.
   */
  license: string | undefined;

  /**
   * The type of the citation.
   */
  type: CitationType;
}
