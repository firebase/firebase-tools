import vscode from "vscode";
import { Kind, OperationDefinitionNode, TypeNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { UserMock, UserMockKind } from "../../../common/messaging/protocol";
import { Impersonation } from "../../dataconnect/types";
import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../../analytics";
import { get } from "lodash";

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
    const originalUserVars = this.executeGraphqlVariables();
    const userVars: any = {};
    let message = "";
    for (const variable of ast.variableDefinitions || []) {
      const varName = variable.variable.name.value;
      userVars[varName] = originalUserVars[varName];
      if (variable.type.kind === Kind.NON_NULL_TYPE) {
        // Required variable.
        if (userVars[varName] === undefined) {
          message += `- missing required $${varName}\n`;
          userVars[varName] = getDefaultScalarValue(getType(variable.type) || "");
        }
      }
    }
    if (userVars === originalUserVars) {
      return;
    }
    executionArgsJSON.value = JSON.stringify(userVars, null, 2,);
    this.broker.send("notifyDataConnectArgs", executionArgsJSON.value);
    this.analyticsLogger.logger.logUsage(
      DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES,
    );
    vscode.window.showInformationMessage(`Missing required variables`);
  }
}

function getType(typeNode: TypeNode): string | null {
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
