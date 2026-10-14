import React from "react";
import { createRoot } from "react-dom/client";
import { broker, useBroker } from "../globals/html-broker";
import { Label } from "../components/ui/Text";
import style from "./data-connect-execution-results.entry.scss";
import { SerializedError } from "../../common/error";
import { GraphqlError, GraphqlErrorExtensions } from "../../../src/dataconnect/types";
import { AuthParamsKind, ExecutionResults } from '../../common/messaging/protocol';
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

// Prevent webpack from removing the `style` import above
style;

function DataConnectExecutionResultsApp() {
  const dataConnectResults = useBroker("notifyDataConnectResults", {
    // Forcibly read the current execution results when the component mounts.
    // This handles cases where the user navigates to the results view after
    // an execution result has already been set.
    initialRequest: "getDataConnectResults",
  });
  const results: ExecutionResults | undefined = dataConnectResults?.results;

  if (!dataConnectResults || !results) {
    return null;
  }

  let respErrorsDisplay: JSX.Element | undefined;
  if (results?.respErr) {
    respErrorsDisplay = <InternalErrorView error={results?.respErr} />;
  }

  let gqlErrorsDisplay: JSX.Element | undefined;
  if (results.gqlErrors?.length) {
    gqlErrorsDisplay = (
      <>
        <GraphQLErrorsView errors={results.gqlErrors} />
      </>
    );
  }

  let resultsDisplay: JSX.Element | undefined;
  if (results.data) {
    resultsDisplay = (
      <code>
        <label>Result Data</label>
        <pre>{JSON.stringify(results.data, null, 2)}</pre>
      </code>
    );
  }

  let variablesDisplay: JSX.Element | undefined;
  if (
    dataConnectResults.variables !== "" &&
    dataConnectResults.variables !== "{}"
  ) {
    variablesDisplay = (
      <>
        <code>
          <label>Variables</label>
          <pre>{dataConnectResults.variables}</pre>
        </code>
        <br />
      </>
    );
  }

  let authDisplay: JSX.Element | undefined;
  switch (dataConnectResults.auth.kind) {
    case AuthParamsKind.ADMIN:
      // Default is admin.
      break;
    case AuthParamsKind.UNAUTHENTICATED:
      authDisplay = (
        <>
          <Label>Unauthenticated</Label>
          <br />
        </>
      );
      break;
    case AuthParamsKind.AUTHENTICATED:
      authDisplay = (
        <>
          <code>
            <label>Auth Claims</label>
            <pre>{dataConnectResults.auth.claims}</pre>
          </code>
          <br />
        </>
      );
      break;
  }

  return (
    <>
      <h2>
        <VSCodeButton onClick={() => broker.send("rerunExecution")} appearance="secondary" style={{ transform: "scale(0.8)" }}>
          <i className="codicon codicon-debug-start"></i>Rerun
        </VSCodeButton>{" "}
        {dataConnectResults.displayName}
      </h2>
      <br />
      {respErrorsDisplay}
      {gqlErrorsDisplay}
      {resultsDisplay}
      <br />
      {authDisplay}
      {variablesDisplay}
      <code>
        <label>Query</label>
        <pre>{dataConnectResults.query}</pre>
      </code>
    </>
  );
}

/** A view for when executions either fail before the HTTP request is sent,
 * or when the HTTP response is an error.
 */
function InternalErrorView({ error }: { error: SerializedError }) {
  return (
    <div className={style.errorContainer}>
      <div className={style.errorItem}>
        <div className={style.errorHeader}>
          <i className="codicon codicon-error" />
          <span>{error.message}</span>
        </div>
        {error.cause && (
          <div style={{ marginLeft: "var(--space-large)" }}>
            <Label>Cause:</Label>
            <InternalErrorView error={error.cause} />
          </div>
        )}
      </div>
    </div>
  );
}

/** A view for when an execution returns status 200 but contains errors. */
function GraphQLErrorsView({ errors }: { errors: readonly GraphqlError[] }) {
  return (
    <div className={style.errorContainer}>
      {errors.filter(e => e.message).map((error, index) => (
        <GraphQLErrorView key={index} error={error} />
      ))}
    </div>
  );
}

function GraphQLErrorView({ error }: { error: GraphqlError }) {
  const { message, path, extensions } = error;
  const { debugDetails, code, workarounds } = (extensions ?? {}) as GraphqlErrorExtensions;

  return (
    <div className={style.errorItem}>
      <div className={style.errorHeader}>
        <i className="codicon codicon-error" />
        {code && code !== "OK" && code !== "UNKNOWN" && (
          <span className={style.errorCode}>{code}</span>
        )}
        <span>{message}</span>
      </div>
      {path && path.length > 0 && (
        <div className={style.errorPath}>
          at{" "}
          {path.map((p: string | number, i: number) => (
            <React.Fragment key={i}>
              {i > 0 && "."}
              <kbd>{p}</kbd>
            </React.Fragment>
          ))}
        </div>
      )}
      {workarounds && workarounds.length > 0 && (
        <div className={style.workarounds}>
          <label>Workarounds</label>
          <pre>
            {workarounds
              .map((w: any) => {
                const yaml = typeof w === "string" ? w : renderYaml(w);
                return `- ${yaml.replace(/\n/g, "\n  ")}`;
              })
              .join("\n")}
          </pre>
        </div>
      )}
      {debugDetails && (
        <div className={style.debugDetails}>
          <label>Debug Details</label>
          <pre>{debugDetails}</pre>
        </div>
      )}
    </div>
  );
}

function renderYaml(obj: any, indent = ""): string {
  if (typeof obj !== "object" || obj === null) {
    return String(obj);
  }

  return Object.entries(obj)
    .map(([key, value]) => {
      const prefix = `${indent}${key}:`;
      if (typeof value === "object" && value !== null) {
        return `${prefix}\n${renderYaml(value, indent + "  ")}`;
      }
      return `${prefix} ${value}`;
    })
    .join("\n");
}

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnectExecutionResultsApp />);
