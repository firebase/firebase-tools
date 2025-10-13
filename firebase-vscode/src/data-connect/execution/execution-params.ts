import vscode from "vscode";
import { print, EnumValueNode, Kind, OperationDefinitionNode, TypeNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { EXAMPLE_CLAIMS, AuthParams, AuthParamsKind } from "../../../common/messaging/protocol";
import { Impersonation, ImpersonationAuthenticated } from "../../dataconnect/types";
import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../../analytics";

/** The unparsed JSON object mutation/query variables.
 *
 * The JSON may be invalid.
 */
export const executionArgsJSON = globalSignal("{}");
export const executionAuthParams = globalSignal<AuthParams>({kind: AuthParamsKind.ADMIN});

export class ExecutionParamsService implements Disposable {
  constructor(readonly broker: ExtensionBrokerImpl, readonly analyticsLogger: AnalyticsLogger) {
    this.disposable.push({
      dispose: broker.on(
        "defineAuthParams",
        (userMock) => (executionAuthParams.value = userMock)
      ),
    });
    this.disposable.push({
      dispose: broker.on(
        "defineVariables",
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
    const userMock = executionAuthParams.value;
    if (!userMock || userMock.kind === AuthParamsKind.ADMIN) {
      return {};
    }
    return {
      impersonate:
        userMock.kind === AuthParamsKind.AUTHENTICATED
          ? { authClaims: JSON.parse(userMock.claims), includeDebugDetails: true }
          : { unauthenticated: true, includeDebugDetails: true },
    };
  }

  async paramsFixHint(ast: OperationDefinitionNode): Promise<void> {
    await this.variablesFixHint(ast);
  }

  private async variablesFixHint(ast: OperationDefinitionNode): Promise<void> {
    const userVars = this.executeGraphqlVariables();
    let description = "";
    for (const varName in userVars) {
      if (!ast.variableDefinitions?.find((v) => v.variable.name.value === varName)) {
        // Remove undefined variable.
        description += `- Removed undefined $${varName}.\n`;
        delete userVars[varName];
      }
    }
    for (const variable of ast.variableDefinitions || []) {
      const varName = variable.variable.name.value;
      if (variable.type.kind === Kind.NON_NULL_TYPE && userVars[varName] === undefined) {
        // Set a default value for missing required variable.
        userVars[varName] = getDefaultScalarValue(print(variable.type.type));
        description += `- Added missing required $${varName} with a default value.\n`;
      }
    }
    if (description === "") {
      return;
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES);
    executionArgsJSON.value = JSON.stringify(userVars, null, 2);
    this.broker.send("notifyVariables", { variables: executionArgsJSON.value, description });
    return;
  }
}
