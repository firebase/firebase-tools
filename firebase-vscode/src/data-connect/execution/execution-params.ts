import vscode from "vscode";
import { EnumValueNode, Kind, OperationDefinitionNode, TypeNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { EXAMPLE_CLAIMS, UserMock, UserMockKind } from "../../../common/messaging/protocol";
import { Impersonation, ImpersonationAuthenticated } from "../../dataconnect/types";
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
        "defineAuthUserMock",
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
    const updatedUser = await this.authUserFixHint(ast);
    const updatedVariable = await this.variablesFixHint(ast);
    if (!updatedUser && !updatedVariable) {
      return;
    }
    const what = updatedUser && updatedVariable
      ? "variables and auth user"
      : updatedUser ? "auth user" : "variables";
    vscode.window.showInformationMessage(`Updated ${what} to match ${ast.operation} ${ast.name?.value}`);
  }

  private async authUserFixHint(ast: OperationDefinitionNode): Promise<boolean> {
    const impersonate = this.executeGraphqlExtensions().impersonate;
    if ((impersonate as ImpersonationAuthenticated)?.authClaims) {
      return false; // auth claims is already set
    }
    const authDir = ast.directives?.find((d) => d.name.value === "auth");
    const authLevel = authDir?.arguments?.find((arg) => arg.name.value === "level")?.value;
    if (!(authLevel as EnumValueNode)?.value?.includes("USER")) {
      return false; // @auth(level) doesn't require authenticated user
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_AUTH_USER);
    executionArgsJSON.value = EXAMPLE_CLAIMS;
    this.broker.send("notifyAuthUserMock");
    return true;
  }

  private async variablesFixHint(ast: OperationDefinitionNode): Promise<boolean> {
    const userVars = this.executeGraphqlVariables();
    let updated = false;
    for (const varName in userVars) {
      if (!ast.variableDefinitions?.find((v) => v.variable.name.value === varName)) {
        // Remove undefined variable.
        updated = true;
        delete userVars[varName];
      }
    }
    for (const variable of ast.variableDefinitions || []) {
      const varName = variable.variable.name.value;
      if (variable.type.kind === Kind.NON_NULL_TYPE && userVars[varName] === undefined) {
        // Set a default value for missing required variable.
        const varTyp = getType(variable.type.type) || "";
        userVars[varName] = getDefaultScalarValue(varTyp);
        updated = true;
      }
    }
    if (!updated) {
      return false;
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES);
    executionArgsJSON.value = JSON.stringify(userVars, null, 2);
    this.broker.send("notifyDataConnectArgs", executionArgsJSON.value);
    return true;
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
