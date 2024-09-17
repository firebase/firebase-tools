import React from "react";
import { Spacer } from "./components/ui/Spacer";
import { broker, brokerSignal } from "./globals/html-broker";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import { Body, Label } from "./components/ui/Text";
import { PanelSection } from "./components/ui/PanelSection";
import { EmulatorPanel as Emulators } from "./components/EmulatorPanel";
import { App } from "./globals/app";
import { signal, useComputed } from "@preact/signals-react";
import { Icon } from "./components/ui/Icon";
import { ButtonGroup } from "./components/ui/ButtonGroup";
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

function Welcome() {
  const configLabel = useComputed(() => {
    return !hasFdcConfigs.value ? "dataconnect.yaml" : "firebase.json";
  });

  return (
    <>
      <Body>
        No <code>{configLabel}</code> detected in this project
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
  return emulatorsRunningInfo.value?.infos ? (
    <Emulators emulatorInfo={emulatorsRunningInfo.value.infos!} />
  ) : (
    <VSCodeButton
      appearance="secondary"
      onClick={() => broker.send("runStartEmulators")}
    >
      Start emulators
    </VSCodeButton>
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
        Configure generated SDK
      </VSCodeButton>
      <Spacer size="xsmall" />
      <Label level={3}>
        See also:{" "}
        <a href="https://firebase.google.com/docs/data-connect/gp/web-sdk">
          Working with generated SDKs
        </a>
      </Label>

      <Spacer size="xlarge" />

      <Body>Deploy FDC services and connectors to production</Body>
      <Label level={3}>
        See also:{" "}
        <a href="https://firebase.google.com/docs/data-connect/quickstart#deploy_your_schema_to_production">
          Deploying
        </a>
      </Label>
      <Spacer size="xsmall" />
      <ButtonGroup>
        <VSCodeButton onClick={() => broker.send("fdc.deploy-all")}>
          Deploy all
        </VSCodeButton>
        <VSCodeButton
          appearance="secondary"
          onClick={() => broker.send("fdc.deploy")}
        >
          Deploy individual
        </VSCodeButton>
      </ButtonGroup>
    </>
  );
}

function Content() {
  return (
    <>
      <PanelSection title="Emulators">
        <EmulatorsPanel />
      </PanelSection>
      <PanelSection title="Data Connect" isLast={true}>
        <DataConnect />
      </PanelSection>
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
        {user.value && project.value && (
          <ProjectSection
            user={user.value?.user!}
            projectId={project.value?.projectId}
            isMonospace={env.value?.env.isMonospace ?? false}
          />
        )}
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
