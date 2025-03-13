import React from "react";
import { createRoot } from "react-dom/client";
import {
  VSCodeButton,
  VSCodeProgressRing,
} from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "../components/ui/Spacer";
import styles from "../globals/index.scss";
import { broker, useBroker } from "../globals/html-broker";
import { PanelSection } from "../components/ui/PanelSection";
import { EmulatorPanel } from "../components/EmulatorPanel";

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnect />);

function DataConnect() {
  const emulatorsRunningInfo = useBroker("notifyEmulatorStateChanged", {
    initialRequest: "getEmulatorInfos",
  });

  const user = useBroker("notifyUserChanged", {
    initialRequest: "getInitialData",
  })?.user;

  if (emulatorsRunningInfo?.status === "starting") {
    return (
      <>
        <label>Emulators starting: see integrated terminal</label>
        <VSCodeProgressRing></VSCodeProgressRing>
      </>
    );
  }

  return (
    <div className={styles.root}>
      <PanelSection title="Local Development">
        <Spacer size="xsmall" />
        {emulatorsRunningInfo?.status === "running" ? (
          <>
            <label>Emulators running in terminal</label>
            <EmulatorPanel
              emulatorInfo={emulatorsRunningInfo.infos as any}
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
          <a href="https://firebase.google.com/docs/data-connect/web-sdk">
            Working with generated SDKs
          </a>
        </p>
        <VSCodeButton onClick={() => broker.send("fdc.configure-sdk")}>
          Configure Generated SDK
        </VSCodeButton>
        <Spacer size="xlarge" />
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
    </div>
  );
}
