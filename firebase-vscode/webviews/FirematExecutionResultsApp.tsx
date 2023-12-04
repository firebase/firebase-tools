import React, { useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { FirematResults } from "../common/messaging/protocol";
import { FirematError } from "../common/error";
import { GraphQLError } from "graphql";

export function FirematExecutionResultsApp() {
  const [results, setResults] = useState<FirematResults | undefined>(undefined);

  useEffect(() => {
    broker.on("notifyFirematResults", setResults);
  }, []);

  if (!results) {
    return null;
  }

  let response: unknown;
  let errorsDisplay: JSX.Element | undefined;

  console.log('received', results)
  throw new Error('stop')

  if (results?.results instanceof FirematError) {
    // We don't display a "response" here, because this is an
    errorsDisplay = <InternalErrorView error={results.results} />;
  } else if (results?.results) {
    response = results.results;
    const errors = results.results.errors;

    if (errors && errors.length !== 0) {
      errorsDisplay = (
        <p>
          {errors.map((error) => (
            <GraphQLErrorView error={error} />
          ))}
        </p>
      );
    }
  }

  let resultsDisplay: JSX.Element | undefined;
  if (response) {
    resultsDisplay = (
      <VSCodeTextArea
        value={JSON.stringify(results.results, null, 2)}
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
      <h3>{results.displayName}</h3>
      <VSCodeTextArea
        value={JSON.stringify(results.args, null, 2)}
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

function InternalErrorView({ error }: { error: Error }) {
  return (
    <>
      {error.name}: {error.message}
    </>
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
    <>
      {pathDisplay}
      {error.name && `${error.name}: `}
      {error.message}
      {error.stack}
    </>
  );
}

// TODO: error cases to handl
// - no emulator yet executign -> http fail
// - invalid json > proto error
// - graphQL errors
