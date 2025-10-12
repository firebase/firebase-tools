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
        "defineAuthUserMock",
        (userMock) => (executionAuthParams.value = userMock)
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
    await this.authUserFixHint(ast);
    await this.variablesFixHint(ast);
  }

  private async authUserFixHint(ast: OperationDefinitionNode): Promise<void> {
    const impersonate = this.executeGraphqlExtensions().impersonate;
    if ((impersonate as ImpersonationAuthenticated)?.authClaims) {
      return; // auth claims is already set
    }
    const authDir = ast.directives?.find((d) => d.name.value === "auth");
    const authLevel = authDir?.arguments?.find((arg) => arg.name.value === "level")?.value;
    if (!(authLevel as EnumValueNode)?.value?.includes("USER")) {
      return ; // @auth(level) doesn't require authenticated user
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_AUTH_USER);
    executionArgsJSON.value = EXAMPLE_CLAIMS;
    this.broker.send("notifyAuthUserMock");
    return;
  }

  private async variablesFixHint(ast: OperationDefinitionNode): Promise<void> {
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
        userVars[varName] = getDefaultScalarValue(print(variable.type.type));
        updated = true;
      }
    }
    if (!updated) {
      return;
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES);
    executionArgsJSON.value = JSON.stringify(userVars, null, 2);
    this.broker.send("notifyDataConnectArgs", executionArgsJSON.value);
    return;
  }
}
