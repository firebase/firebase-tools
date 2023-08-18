import React, { FormEvent, FormEventHandler, useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { Label } from "./components/ui/Text";

export function FirematExecutionArgumentsApp() {
  const [args, setArguments] = useState({});

  useEffect(() => {
    broker.send("definedFirematArgs", { args });
  });

  const handleInput = (input: string) => {
    try {
      const json = JSON.parse(input);
      setArguments(json);
    } catch {}
  };

  return (
    <>
      <VSCodeTextArea
        rows={10}
        cols={40}
        resize={"both"}
        initialValue={"{}"}
        onInput={(e) => handleInput(e.target.value)}
      >
        <Label>Arguments used in operations (needs to be valid JSON)</Label>
      </VSCodeTextArea>
    </>
  );
}
