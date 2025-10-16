import { print, Kind, OperationDefinitionNode } from "graphql";
import { globalSignal } from "../../utils/globals";
import { getDefaultScalarValue } from "../ad-hoc-mutations";
import { AuthParams, AuthParamsKind } from "../../../common/messaging/protocol";
import { Impersonation } from "../../dataconnect/types";
import { Disposable } from "vscode";
import { ExtensionBrokerImpl } from "../../extension-broker";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../../analytics";

/** 
 * Contains the unparsed JSON object mutation/query variables.
 * The JSON may be invalid.
 */
export const executionVarsJSON = globalSignal("{}");
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
        (value) => (executionVarsJSON.value = value),
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
    const variables = executionVarsJSON.value;
    if (!variables) {
      return {};
    }
    try {
      return JSON.parse(variables);
    } catch (e: any) {
      throw new Error(
        "Unable to parse variables as JSON. Check the variables pane.\n" + e.message,
      );
    }
  }

  executeGraphqlExtensions(): { impersonate?: Impersonation } {
    const auth = executionAuthParams.value;
    switch (auth.kind) {
      case AuthParamsKind.ADMIN:
        this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_AUTH_ADMIN);
        return {};
      case AuthParamsKind.UNAUTHENTICATED:
        this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_AUTH_UNAUTHENTICATED);
        return { impersonate: { unauthenticated: true, includeDebugDetails: true } };
      case AuthParamsKind.AUTHENTICATED:
        this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_AUTH_AUTHENTICATED);
        try {
          return {
            impersonate:
              { authClaims: JSON.parse(auth.claims), includeDebugDetails: true }
          };
        } catch (e: any) {
          throw new Error(
            "Unable to parse auth claims as JSON. Check the authentication panel.\n" + e.message,
          );
        }
      default:
        throw new Error(`Unknown auth params kind: ${auth}`);
    }
  }

  async applyDetectedFixes(ast: OperationDefinitionNode): Promise<void> {
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
        this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_UNDEFINED_VARIABLES);
        fixes.push(`Removed undefined variables: ${undefinedVars.map((v) => "$" + v).join(", ")}`);
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
        this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_MISSING_VARIABLES);
        fixes.push(`Included required variables: ${missingRequiredVars.map((v) => "$" + v).join(", ")}`);
      }
    }
    if (fixes.length === 0) {
      return;
    }
    executionVarsJSON.value = JSON.stringify(userVars, null, 2);
    this.broker.send("notifyVariables", { variables: executionVarsJSON.value, fixes });
    return;
  }
}