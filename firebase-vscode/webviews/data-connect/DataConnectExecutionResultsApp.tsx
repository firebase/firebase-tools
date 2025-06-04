import React from "react";
import { useBroker } from "../globals/html-broker";
import { Label } from "../components/ui/Text";
import style from "./data-connect-execution-results.entry.scss";
import { SerializedError } from "../../common/error";
import { ExecutionResult, GraphQLError } from "graphql";
import { isExecutionResult } from "../../common/graphql";

// Prevent webpack from removing the `style` import above
style;

export function DataConnectExecutionResultsApp() {
  const dataConnectResults = useBroker("notifyDataConnectResults", {
    // Forcibly read the current execution results when the component mounts.
    // This handles cases where the user navigates to the results view after
    // an execution result has already been set.
    initialRequest: "getDataConnectResults",
  });
  const results: ExecutionResult | SerializedError | undefined =
    dataConnectResults?.results;

  if (!dataConnectResults || !results) {
    return null;
  }

  let response: unknown;
  let errorsDisplay: JSX.Element | undefined;

  if (isExecutionResult(results)) {
    // We display the response even if there are errors, just
    // in case the user wants to see the response anyway.
    response = results.data;
    const errors = results.errors;
    if (errors && errors.length !== 0) {
      errorsDisplay = (
        <>
          <Label>Error</Label>
          <GraphQLErrorView errors={errors} />
        </>
      );
    }
  } else {
    // We don't display a "response" here, because this is an error
    // that occurred without returning a valid GraphQL response.
    errorsDisplay = <InternalErrorView error={results} />;
  }

  let resultsDisplay: JSX.Element | undefined;
  if (response) {
    resultsDisplay = (
      <>
        <Label>Results</Label>
        <code>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </code>
      </>
    );
  }

  return (
    <>
      {errorsDisplay}
      {resultsDisplay}

      <Label style={{ textTransform: "capitalize" }}>
        {dataConnectResults.displayName}
      </Label>
      <code>
        <pre>{dataConnectResults.query}</pre>
      </code>

      <Label>Arguments</Label>
      <code>
        <pre>{dataConnectResults.args}</pre>
      </code>
    </>
  );
}

/** A view for when executions either fail before the HTTP request is sent,
 * or when the HTTP response is an error.
 */
function InternalErrorView({ error }: { error: SerializedError }) {
  return (
    <>
      <Label>Error</Label>
      <p>
        {
          // Stacktraces usually already include the message, so we only
          // display the message if there is no stacktrace.
          error.stack ? <StackView stack={error.stack} /> : error.message
        }
        {error.cause && (
          <>
            <br />
            <h4>Cause:</h4>
            <InternalErrorView error={error.cause} />
          </>
        )}
      </p>
    </>
  );
}

/** A view for when an execution returns status 200 but contains errors. */
function GraphQLErrorView({ errors }: { errors: readonly GraphQLError[] }) {
  let pathDisplay: JSX.Element | undefined;
  // update path
  const errorsWithPathDisplay = errors.map((error) => {
    if (error.path) {
      // Renders the path as a series of kbd elements separated by commas
      return {
        ...error,
        pathDisplay: (
          <>
            {error.path?.map((path, index) => {
              const item = <kbd>{path}</kbd>;

              return index === 0 ? item : <>, {item}</>;
            })}{" "}
          </>
        ),
      };
    }
    return error;
  });

  return (
    <>
      {errorsWithPathDisplay.map((error, index) => {
        return (
          <p style={{ whiteSpace: "pre-wrap" }}  key={index}>
            {pathDisplay}
            {error.message}
            {error.stack && <StackView stack={error.stack} />}
          </p>
        );
      })}
    </>
  );
}

function StackView({ stack }: { stack: string }) {
  return (
    <span
      style={{
        // Preserve stacktrace formatting
        whiteSpace: "pre-wrap",
      }}
    >
      {stack}
    </span>
  );
}
