import React, { FormEvent, FormEventHandler, useEffect, useState } from "react";
import { broker } from "./globals/html-broker";
import { VSCodeButton, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { Label } from "./components/ui/Text";
export function FirematExecutionArgumentsApp() {
  let input = "{}";

  const handleChange = (e) => {
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
        onChange={handleChange}
      >
        <Label>Arguments used in operations (needs to be valid JSON)</Label>
      </VSCodeTextArea>
    </>
  );
}
