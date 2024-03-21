import React from "react";
import { createRoot } from "react-dom/client";
import {
  VSCodeButton,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import styles from "./globals/index.scss";
import { TEXT } from "./globals/ux-text";
import { broker } from "./globals/html-broker";
import { Label } from "./components/ui/Text";
import { vsCodeButton } from "@vscode/webview-ui-toolkit";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnect />);
// TODO: deploy button should be enabled on valid production connection
const isConnectedProduction = false;
const onInput = (e) => {
  broker.send("updateDataConnectPostgresString", e.target.value);
};
function DataConnect() {
  return (
    <>
      <Spacer size="small" />
      <Label level={2}>{TEXT.CONNECT_TO_INSTANCE_DESCRIPTION}</Label>
      <VSCodeButton onClick={() => broker.send("connectToInstance")}>
        {TEXT.CONNECT_TO_INSTANCE}
      </VSCodeButton>
      <Spacer size="medium" />
      <Label level={2}>{TEXT.LOCAL_CONN_STRING_LABEL}</Label>
      <VSCodeTextField onInput={onInput}></VSCodeTextField>
    </>
  );
}
