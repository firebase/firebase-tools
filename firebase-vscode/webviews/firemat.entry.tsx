import React from "react";
import { createRoot } from "react-dom/client";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import styles from "./globals/index.scss";
import { TEXT } from "./globals/ux-text";
import { broker } from "./globals/html-broker";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<Firemat />);

function Firemat() {
  return (
    <>
      <Spacer size="small" />
      <VSCodeButton>{TEXT.DEPLOY_FIREMAT}</VSCodeButton>
      <Spacer size="xlarge" />
      <VSCodeButton onClick={() => broker.send("connectToInstance")}>
        {TEXT.CONNECT_TO_INSTANCE}
      </VSCodeButton>
    </>
  );
}
