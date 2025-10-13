import { print, Kind, OperationDefinitionNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { AuthParams, AuthParamsKind } from "../../../common/messaging/protocol";
import { Impersonation } from "../../dataconnect/types";
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
        (auth) => (executionAuthParams.value = auth)
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
    const auth = executionAuthParams.value;
    if (!auth || auth.kind === AuthParamsKind.ADMIN) {
      return {};
    }
    return {
      impersonate:
        auth.kind === AuthParamsKind.AUTHENTICATED
          ? { authClaims: JSON.parse(auth.claims), includeDebugDetails: true }
          : { unauthenticated: true, includeDebugDetails: true },
    };
  }

  async applyFixes(ast: OperationDefinitionNode): Promise<void> {
    await this.variablesFixHint(ast);
  }

  private async variablesFixHint(ast: OperationDefinitionNode): Promise<void> {
    const userVars = this.executeGraphqlVariables();
    const fixes = [];
    {
      const undefinedVars = [];
      for (const varName in userVars) {
        if (!ast.variableDefinitions?.find((v) => v.variable.name.value === varName)) {
          delete userVars[varName];
          undefinedVars.push(varName);
        }
      }
      if (undefinedVars.length > 0) {
        fixes.push(`Removed undefined variables: ${undefinedVars.map((v) => "$" + v).join(", ")}.`);
      }
    }
    {
      const missingRequiredVars = [];
      for (const variable of ast.variableDefinitions || []) {
        const varName = variable.variable.name.value;
        if (variable.type.kind === Kind.NON_NULL_TYPE && userVars[varName] === undefined) {
          userVars[varName] = getDefaultScalarValue(print(variable.type.type));
          missingRequiredVars.push(varName);
        }
      }
      if (missingRequiredVars.length > 0) {
        fixes.push(`Included required variables: ${missingRequiredVars.map((v) => "$" + v).join(", ")}.`);
      }
    }
    if (fixes.length === 0) {
      return;
    }
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.MISSING_VARIABLES);
    executionArgsJSON.value = JSON.stringify(userVars, null, 2);
    this.broker.send("notifyVariables", { variables: executionArgsJSON.value, fixes });
    return;
  }
}
