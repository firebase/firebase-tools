import React, { useEffect } from "react";
import { Spacer } from "./components/ui/Spacer";
import { broker, brokerSignal, useBroker } from "./globals/html-broker";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeProgressRing,
} from "@vscode/webview-ui-toolkit/react";
import { Body, Label } from "./components/ui/Text";
import { PanelSection } from "./components/ui/PanelSection";
import { EmulatorPanel as Emulators } from "./components/EmulatorPanel";
import { App } from "./globals/app";
import { signal, useComputed } from "@preact/signals-react";
import { Icon } from "./components/ui/Icon";
import { ExternalLink } from "./components/ui/ExternalLink";

const user = brokerSignal("notifyUserChanged", {
  initialRequest: "getInitialData",
});
const isLoadingUser = brokerSignal("notifyIsLoadingUser");
const project = brokerSignal("notifyProjectChanged");
const env = brokerSignal("notifyEnv");
const configs = brokerSignal("notifyFirebaseConfig", {
  initialRequest: "getInitialData",
});
const hasFdcConfigs = brokerSignal("notifyHasFdcConfigs", {
  initialRequest: "getInitialHasFdcConfigs",
});
const emulatorsRunningInfo = brokerSignal("notifyEmulatorStateChanged", {
  initialRequest: "getEmulatorInfos",
});
const docsLink = brokerSignal("notifyDocksLink", {
  initialRequest: "getDocsLink",
});

const showResetPanel = brokerSignal("notifyEmulatorsHanging");

function Welcome() {
  const configLabel = useComputed(() => {
    return !hasFdcConfigs.value ? "dataconnect.yaml" : "firebase.json";
  });

  return (
    <>
      <Body>
        No <code>{configLabel.value}</code> detected in this project
      </Body>
      <Spacer size="medium" />
      <VSCodeButton
        onClick={() => {
          broker.send("runFirebaseInit");
        }}
      >
        Run firebase init
      </VSCodeButton>
    </>
  );
}

function EmulatorsPanel() {
  if (emulatorsRunningInfo.value?.status === "starting") {
    const runningPanel = (
      <>
        <label>Emulator starting: see integrated terminal</label>
        <VSCodeProgressRing></VSCodeProgressRing>
      </>
    );

    if (showResetPanel.value) {
      return (
        <>
          <Spacer size="medium"></Spacer>
          <label>
            Emulator start-up is taking a while. In case of error, click refresh.
          </label>
          <VSCodeProgressRing></VSCodeProgressRing>
          <Spacer size="medium"></Spacer>
          <VSCodeButton
            appearance="secondary"
            onClick={() => {
              broker.send("getEmulatorInfos");
              showResetPanel.value = false;
            }}
          >
            Refresh Emulator View
          </VSCodeButton>
        </>
      );
    }
    return runningPanel;
  }

  return emulatorsRunningInfo.value?.infos &&
    emulatorsRunningInfo.value?.status === "running" ? (
    <Emulators emulatorInfo={emulatorsRunningInfo.value.infos!} />
  ) : (
    <>
      <VSCodeButton
        appearance="secondary"
        onClick={() => broker.send("runStartEmulators")}
      >
        Start emulators
      </VSCodeButton>
      <Spacer size="xsmall" />
      <Label level={3}>
        <a onClick={() => {
          broker.send("fdc.open-emulator-settings")
        }}>
          Configure emulator
        </a>
      </Label>
      <Label level={3}>
        See also:{" "}
        <a href="https://firebase.google.com/docs/emulator-suite">
          Introduction to Firebase emulators
        </a>
      </Label>
    </>
  );
}

const deployMenu = signal(false);

function DataConnect() {
  return (
    <>
      {docsLink.value && (
        <>
          <Body>
            <ExternalLink href={docsLink.value} prefix={<Icon icon="book" />}>
              View reference docs
            </ExternalLink>
          </Body>
          <Spacer size="xlarge" />
        </>
      )}

      <VSCodeButton
        onClick={() => broker.send("fdc.configure-sdk")}
        appearance="secondary"
      >
        Add SDK to app
      </VSCodeButton>
      <Spacer size="xsmall" />
      <Label level={3}>
        See also:{" "}
        <a href="https://firebase.google.com/docs/data-connect/web-sdk">
          Working with generated SDKs
        </a>
      </Label>

      <Spacer size="xlarge" />

      <Spacer size="small" />
      <VSCodeButton onClick={() => broker.send("fdc.deploy-all")}>
        Deploy to production
      </VSCodeButton>
      <Spacer size="xsmall" />
      <Label level={3}>
        See also:{" "}
        <a href="https://firebase.google.com/docs/data-connect/quickstart#deploy_your_schema_to_production">
          Deploying schema and connectors
        </a>
      </Label>
    </>
  );
}

function Content() {
  useEffect(() => {
    broker.send("getDocsLink");
  }, []);

  return (
    <>
      <PanelSection>
        <EmulatorsPanel />
      </PanelSection>
      <PanelSection isLast={true}>
        <DataConnect />
      </PanelSection>
    </>
  );
}

function ConfigPicker() {
  const configs = useBroker("notifyFirebaseConfigListChanged", {
    initialRequest: "getInitialFirebaseConfigList",
  });

  if (!configs || configs.values.length < 2) {
    // Only show the picker when there are multiple configs
    return <></>;
  }

  return (
    <>
      <Spacer size="medium" />

      <Label>Choose a `firebase.json` location</Label>
      <VSCodeDropdown
        value={configs.selected}
        onChange={(e) =>
          broker.send("selectFirebaseConfig", (e.target as any).value)
        }
      >
        {configs.values.map((uri) => (
          <VSCodeOption key={uri}>{uri}</VSCodeOption>
        ))}
      </VSCodeDropdown>
    </>
  );
}

export function SidebarApp() {
  const isInitialized = useComputed(() => {
    return !!configs.value?.firebaseJson?.value && hasFdcConfigs.value;
  });

  if (isLoadingUser.value) {
    return <Body>Loading...</Body>;
  }

  return (
    <App>
      <PanelSection>
        <AccountSection
          user={user.value?.user ?? null}
          isLoadingUser={false}
          isMonospace={env.value?.env.isMonospace ?? false}
        />
        {user.value?.user && project.value && (
          <ProjectSection
            user={user.value.user}
            projectId={project.value?.projectId}
            isMonospace={env.value?.env.isMonospace ?? false}
          />
        )}
        <ConfigPicker />
      </PanelSection>

      {user.value &&
        (isInitialized.value ? (
          <Content />
        ) : (
          <PanelSection isLast={true}>
            <Welcome />
          </PanelSection>
        ))}
    </App>
  );
}
