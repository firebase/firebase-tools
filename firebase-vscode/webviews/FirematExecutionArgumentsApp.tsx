import React from "react";
import { broker } from "./globals/html-broker";
import { VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { Label } from "./components/ui/Text";
export function FirematExecutionArgumentsApp() {
  let input = "{}";

  const handleInput = (e) => {
    try {
      const args = JSON.parse(e.target.value);
      broker.send("definedFirematArgs", { args });
    } catch (e) {
      console.log(e);
    }
  };

  return (
    <>
      <VSCodeTextArea
        rows={10}
        cols={80}
        resize={"both"}
        value={input}
        onInput={handleInput}
      >
        <Label>Arguments used in operations (needs to be valid JSON)</Label>
      </VSCodeTextArea>
    </>
  );
}
