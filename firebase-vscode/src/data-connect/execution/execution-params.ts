import vscode from "vscode";
import { EnumValueNode, Kind, OperationDefinitionNode, TypeNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { UserMock, UserMockKind } from "../../../common/messaging/protocol";
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
    await this.authUserFixHint(ast);
    await this.variablesFixHint(ast);
  }

  private async authUserFixHint(ast: OperationDefinitionNode): Promise<void> {
    const impersonate = this.executeGraphqlExtensions().impersonate;
    if ((impersonate as ImpersonationAuthenticated).authClaims) {
      return;
    }
    const authDir = ast.directives?.find((d) => d.name.value === "auth");
    const authLevel = authDir?.arguments?.find((arg) => arg.name.value === "level")?.value;
    if ((authLevel as EnumValueNode).value !== "PUBLIC") {
      this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_AUTH_CLAIMS);
      executionArgsJSON.value = `{\n  "email_verified": true,\n  "sub": "exampleUserId"\n}`;
      // this.broker.send("notifyAuthUserMockChange", executionArgsJSON.value);
      vscode.window.showInformationMessage(`Set a fake Firebase Auth user`);
    }
  }

  private async variablesFixHint(ast: OperationDefinitionNode): Promise<void> {
    const userVars = this.executeGraphqlVariables();
    let message = "";
    for (const varName in userVars) {
      if (!ast.variableDefinitions?.find((v) => v.variable.name.value === varName)) {
        // Remove undefined variable.
        message += `- Undefined \$${varName}\n`;
        delete userVars[varName];
      }
    }
    for (const variable of ast.variableDefinitions || []) {
      const varName = variable.variable.name.value;
      if (variable.type.kind === Kind.NON_NULL_TYPE && userVars[varName] === undefined) {
        // Set a default value for missing required variable.
        const varTyp = getType(variable.type.type) || "";
        message += `- Missing required \$${varName}: ${varTyp}!\n`;
        userVars[varName] = getDefaultScalarValue(varTyp);
      }
    }
    if (message === "") {
      return;
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES);
    executionArgsJSON.value = JSON.stringify(userVars, null, 2);
    this.broker.send("notifyDataConnectArgs", executionArgsJSON.value);
    vscode.window.showInformationMessage(`Updated variables to match ${ast.operation} ${ast.name?.value}`);
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
