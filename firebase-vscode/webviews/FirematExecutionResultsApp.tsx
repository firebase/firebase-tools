import React, { useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { FirematResults } from "../common/messaging/protocol";
import {
  FirematError,
  SerializedError,
  isFirematErrorMeta,
} from "../common/error";
import { ExecutionResult, GraphQLError } from "graphql";
import { isExecutionResult } from "../common/graphql";

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
    response = results;
    const errors = results.errors;

    if (errors && errors.length !== 0) {
      errorsDisplay = (
        <p>
          {errors.map((error) => (
            <GraphQLErrorView error={error} />
          ))}
        </p>
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
      <VSCodeTextArea
        value={JSON.stringify(results, null, 2)}
        readOnly={true}
        cols={80}
        rows={20}
      >
        Results
      </VSCodeTextArea>
    );
  }

  return (
    <>
      <h3>{firematResults.displayName}</h3>
      <VSCodeTextArea
        value={firematResults.args}
        readOnly={true}
        cols={80}
        rows={5}
      >
        Arguments
      </VSCodeTextArea>
      {errorsDisplay}
      {resultsDisplay}
    </>
  );
}

function InternalErrorView({ error }: { error: SerializedError }) {
  const body = error.body;
  let bodyView: JSX.Element | undefined;
  if (isFirematErrorMeta(body)) {
    bodyView = (
      <>
        {body.code}: {body.message}
        {body.details}
      </>
    );
  }

  return (
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
  );
}

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
      <h4>GraphQL Error:</h4>
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
