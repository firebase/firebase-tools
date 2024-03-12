import React from "react";
import { createRoot } from "react-dom/client";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import styles from "./globals/index.scss";
import { TEXT } from "./globals/ux-text";
import { broker } from "./globals/html-broker";
import { Label } from "./components/ui/Text";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnect />);
// TODO: deploy button should be enabled on valid production connection
const isConnectedProduction = false;
function DataConnect() {
  return (
    <>
      <Spacer size="small" />
      <Label level={2}>{TEXT.CONNECT_TO_INSTANCE_DESCRIPTION}</Label>
      <VSCodeButton onClick={() => broker.send("connectToInstance")}>
        {TEXT.CONNECT_TO_INSTANCE}
      </VSCodeButton>
      <Spacer size="xlarge" />
      <Label level={2}>{TEXT.DEPLOY_FDC_DESCRIPTION}</Label>
      <VSCodeButton disabled={!isConnectedProduction}>
        {isConnectedProduction
          ? TEXT.DEPLOY_FDC_ENABLED
          : TEXT.DEPLOY_FDC_DISABLED}
      </VSCodeButton>
    </>
  );
}
