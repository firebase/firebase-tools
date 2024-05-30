import React from "react";
import { createRoot } from "react-dom/client";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import styles from "./globals/index.scss";
import { broker, useBroker } from "./globals/html-broker";
import { PanelSection } from "./components/ui/PanelSection";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnect />);

function DataConnect() {
  const emulatorsStatus =
    useBroker("notifyEmulatorStateChanged", {
      initialRequest: "getEmulatorInfos",
    })?.status ?? "stopped";

  return (
    <>
      <PanelSection title="Production" isLast={true}>
        <p>
          Deploy FDC services and connectors to production. See also:{" "}
          <a href="https://firebase.google.com/docs/data-connect/quickstart">Deploying</a>
        </p>
        <Spacer size="xsmall" />
        <VSCodeButton onClick={() => broker.send("fdc.deploy")}>
          Deploy
        </VSCodeButton>
        <Spacer size="small" />
        <VSCodeButton
          appearance="secondary"
          onClick={() => broker.send("fdc.deploy-all")}
        >
          Deploy all
        </VSCodeButton>
      </PanelSection>
    </>
  );
}
