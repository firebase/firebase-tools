import React from "react";
import { createRoot } from "react-dom/client";
import {
  VSCodeButton,
  VSCodeProgressRing,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "../components/ui/Spacer";
import styles from "../globals/index.scss";
import { broker, useBroker, useBrokerListener } from "../globals/html-broker";
import { PanelSection } from "../components/ui/PanelSection";
import { EmulatorPanel } from "../components/EmulatorPanel";
import { computed } from "@preact/signals-core";
import { Emulators } from "../emulator/types";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnect />);

function DataConnect() {
  const emulatorsRunningInfo =
    useBroker("notifyEmulatorStateChanged", {
      initialRequest: "getEmulatorInfos",
    }) ?? false;

  const psqlString = useBroker("notifyPostgresStringChanged");

  const user = useBroker("notifyUserChanged", {
    initialRequest: "getInitialData",
  })?.user;

  if (emulatorsRunningInfo && emulatorsRunningInfo.status === "starting") {
    return (
      <>
        <label>Emulators starting: see integrated terminal</label>
        <VSCodeProgressRing></VSCodeProgressRing>
      </>
    );
  }

  return (
    <>
      <PanelSection title="Local Development">
        <Spacer size="xsmall" />
        {emulatorsRunningInfo && emulatorsRunningInfo.status === "running" ? (
          <>
            <label>Emulators running in terminal</label>
            <EmulatorPanel
              emulatorInfo={emulatorsRunningInfo.infos}
            ></EmulatorPanel>
          </>
        ) : (
          <VSCodeButton onClick={() => broker.send("runStartEmulators")}>
            Start emulators
          </VSCodeButton>
        )}
        <Spacer size="xlarge" />
        <p>
          Configure a generated SDK.
          <br></br>
          See also:{" "}
          <a href="https://firebase.google.com/docs/data-connect/gp/web-sdk">
            Working with generated SDKs
          </a>
        </p>
        <VSCodeButton onClick={() => broker.send("fdc.configure-sdk")}>
          Configure Generated SDK
        </VSCodeButton>
      </PanelSection>
      <PanelSection title="Production" isLast={true}>
        <p>
          Deploy FDC services and connectors to production. See also:{" "}
          <a href="https://firebase.google.com/docs/data-connect/quickstart#deploy_your_schema_to_production">
            Deploying
          </a>
        </p>
        <Spacer size="xsmall" />
        <VSCodeButton onClick={() => broker.send("fdc.deploy-all")}>
          Deploy
        </VSCodeButton>
        <Spacer size="small" />
        <VSCodeButton
          appearance="secondary"
          onClick={() => broker.send("fdc.deploy")}
        >
          Deploy Individual
        </VSCodeButton>
      </PanelSection>
    </>
  );
}
