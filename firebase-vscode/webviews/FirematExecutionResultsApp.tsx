import React, { useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";

interface FirematResults {
  args: {};
  query: string;
  results: {};
}

export function FirematExecutionResultsApp() {
  const [results, setResults] = useState<FirematResults | undefined>(undefined);

  useEffect(() => {
    broker.on("notifyFirematResults", setResults);
  }, []);

  return results ? (
    <>
      <VSCodeTextArea value={results.query} readOnly={true} cols={80} rows={10}>
        Query
      </VSCodeTextArea>

      <VSCodeTextArea
        value={JSON.stringify(results.args, null, 2)}
        readOnly={true}
        cols={80}
        rows={5}
      >
        Arguments
      </VSCodeTextArea>

      <VSCodeTextArea
        value={JSON.stringify(results.results, null, 2)}
        readOnly={true}
        cols={80}
        rows={20}
      >
        Results
      </VSCodeTextArea>
    </>
  ) : null;
}
