import React, { useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { Label } from "./components/ui/Text";
import style from "./firemat-execution-results.entry.scss";
import { FirematResults } from "../common/messaging/protocol";
import { SerializedError } from "../common/error";
import { ExecutionResult, GraphQLError } from "graphql";
import { isExecutionResult } from "../common/graphql";

// Prevent webpack from removing the `style` import above
style;

export function FirematExecutionResultsApp() {
  const [firematResults, setResults] = useState<FirematResults | undefined>(
    undefined
  );
  const results: ExecutionResult | SerializedError | undefined =
    firematResults?.results;

  useEffect(() => {
    broker.on("notifyFirematResults", setResults);
  }, []);

  if (!firematResults || !results) {
    return null;
  }

  let response: unknown;
  let errorsDisplay: JSX.Element | undefined;

  if (isExecutionResult(results)) {
    // We display the response even if there are errors, just
    // in case the user wants to see the response anyway.
    response = results;
    const errors = results.errors;

    if (errors && errors.length !== 0) {
      errorsDisplay = (
        <>
          <Label>Error</Label>
          {errors.map((error) => (
            <GraphQLErrorView error={error} />
          ))}
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
        {firematResults.displayName}
      </Label>
      <code>
        <pre>{firematResults.query}</pre>
      </code>

      <Label>Arguments</Label>
      <code>
        <pre>{firematResults.args}</pre>
      </code>
    </>
  );
}

/** A view for when executions either fail before the HTTP request is sent,
 * or when the HTTP response is an error.
 */
function InternalErrorView({ error }: { error: SerializedError }) {
  return (
    <p>
      <Label>Error</Label>
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
  );
}

/** A view for when an execution returns status 200 but contains errors. */
function GraphQLErrorView({ error }: { error: GraphQLError }) {
  let pathDisplay: JSX.Element | undefined;
  if (error.path) {
    // Renders the path as a series of kbd elements separated by commas
    pathDisplay = (
      <>
        {error.path?.map((path, index) => {
          const item = <kbd>{path}</kbd>;

          return index === 0 ? item : <>, {item}</>;
        })}{" "}
      </>
    );
  }

  return (
    <p style={{ whiteSpace: "pre-wrap" }}>
      {pathDisplay}
      {error.message}
      {error.stack && <StackView stack={error.stack} />}
    </p>
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
