import vscode from "vscode";
import { OperationDefinitionNode, TypeNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { UserMock, UserMockKind } from "../../../common/messaging/protocol";
import { Impersonation } from "../../dataconnect/types";
import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../../analytics";

/** The unparsed JSON object mutation/query variables.
 *
 * The JSON may be invalid.
 */
export const executionArgsJSON = globalSignal("{}");
export const authUserMock = globalSignal<UserMock | undefined>(undefined);

export class ExecutionParamsService implements Disposable {
  constructor(readonly broker: ExtensionBrokerImpl, readonly analyticsLogger: AnalyticsLogger) {
    this.disposable.push({
      dispose: broker.on(
        "notifyAuthUserMockChange",
        (userMock) => (authUserMock.value = userMock)
      ),
    });
    this.disposable.push({
      dispose: broker.on(
        "definedDataConnectArgs",
        (value) => (executionArgsJSON.value = value),
      )
    });
  }

  disposable: Disposable[] = [];

  dispose() {
    for (const disposable of this.disposable) {
      disposable.dispose();
    }
  }

  executeGraphqlVariables(): Record<string, any> {
    const variables = executionArgsJSON.value;
    if (!variables) {
      return {};
    }
    try {
      return JSON.parse(variables);
    } catch (e: any) {
      throw new Error(
        "Unable to parse variables as JSON. Double check that that there are no unmatched braces or quotes, or unqouted keys in the variables pane.",
      );
    }
  }

  executeGraphqlExtensions(): { impersonate?: Impersonation } {
    const userMock = authUserMock.value;
    if (!userMock || userMock.kind === UserMockKind.ADMIN) {
      return {};
    }
    return {
      impersonate:
        userMock.kind === UserMockKind.AUTHENTICATED
          ? { authClaims: JSON.parse(userMock.claims), includeDebugDetails: true }
          : { unauthenticated: true, includeDebugDetails: true },
    };
  }

  async paramsFixHint(ast: OperationDefinitionNode): Promise<void> {
    await this.variablesFixHint(ast);
  }

  private async variablesFixHint(ast: OperationDefinitionNode): Promise<void> {
    const variablesJSON = executionArgsJSON.value;
    const missingArgs = await verifyMissingArgs(ast, variablesJSON);
    if (!missingArgs.length) {
      return;
    }
    const missingArgsJSON = getDefaultArgs(missingArgs);
    executionArgsJSON.value = JSON.stringify({
      ...JSON.parse(variablesJSON),
      ...missingArgsJSON,
    }, null, 2);
    this.broker.send("notifyDataConnectArgs", executionArgsJSON.value);
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES);
    vscode.window.showInformationMessage(`Missing required variables`);
  }
}

function getArgsWithTypeFromOperation(
  ast: OperationDefinitionNode,
): TypedInput[] {
  if (!ast.variableDefinitions) {
    return [];
  }
  return ast.variableDefinitions.map((variable) => {
    const varName = variable.variable.name.value;

    const typeNode = variable.type;

    function getType(typeNode: TypeNode): string | null {
      // Same as previous example
      switch (typeNode.kind) {
        case "NamedType":
          return typeNode.name.value;
        case "ListType":
          const innerTypeName = getType(typeNode.type);
          return `[${innerTypeName}]`;
        case "NonNullType":
          const nonNullTypeName = getType(typeNode.type);
          return `${nonNullTypeName}!`;
        default:
          return null;
      }
    }

    const type = getType(typeNode);

    return { varName, type };
  });
}

interface TypedInput {
  varName: string;
  type: string | null;
}

// checks if required arguments are present in payload
async function verifyMissingArgs(ast: OperationDefinitionNode, jsonArgs: string): Promise<TypedInput[]> {
  let userArgs: { [key: string]: any };
  try {
    userArgs = JSON.parse(jsonArgs);
  } catch (e: any) {
    throw new Error("Invalid JSON", e);
  }

  const argsWithType = getArgsWithTypeFromOperation(ast);
  if (!argsWithType) {
    return [];
  }
  return argsWithType
    .filter((arg) => arg.type?.includes("!"))
    .filter((arg) => userArgs[arg.varName] === undefined);
}

function getDefaultArgs(args: TypedInput[]) {
  return args.reduce((acc: { [key: string]: any }, arg) => {
    acc[arg.varName] = getDefaultScalarValue((arg.type || "").replaceAll("!", ""));
    return acc;
  }, {});
}