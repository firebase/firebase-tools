import React, { FormEvent, FormEventHandler } from "react";
import { broker } from "./globals/html-broker";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { Label } from "./components/ui/Text";

export function FirematExecutionArgumentsApp() {
  let input = "{}";

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    broker.send("definedFirematArgs", e.target.value);
  };

  return (
    <>
      <VSCodeTextArea
        rows={10}
        cols={80}
        resize={"both"}
        value={input}
        // @ts-ignore: VSCodeTextArea.onInput seems incorrectly typed
        onInput={handleInput}
      >
        <Label>Arguments used in operations (needs to be valid JSON)</Label>
      </VSCodeTextArea>
    </>
  );
}
