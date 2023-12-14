import React, { useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { Label } from "./components/ui/Text";
import style from "./firemat-execution-results.entry.scss";

// Prevent webpack from removing the `style` import above
style;

interface FirematResults {
  args: string;
  query: string;
  results: {};
  displayName: string;
}

export function FirematExecutionResultsApp() {
  const [results, setResults] = useState<FirematResults | undefined>(undefined);

  useEffect(() => {
    broker.on("notifyFirematResults", setResults);
  }, []);

  return results ? (
    <>
      <Label style={{ textTransform: "capitalize" }}>
        {results.displayName}
      </Label>
      <code>
        <pre>{results.query}</pre>
      </code>
      <Label>Arguments</Label>
      <code>
        <pre>{results.args}</pre>
      </code>
      <Label>Results</Label>
      <code>
        <pre>{JSON.stringify(results.results, null, 2)}</pre>
      </code>
    </>
  ) : null;
}
