import React, { useEffect, useState } from "react";
import { Spacer } from "./components/ui/Spacer";
import { broker, useBroker } from "./globals/html-broker";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";

import { webLogger } from "./globals/web-logger";
import { ValueOrError } from "./messaging/protocol";
import { FirebaseConfig } from "../../src/firebaseConfig";
import { RCData } from "../../src/rc";
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

export function SidebarApp() {
  const env = useBroker("notifyEnv")?.env;
  /**
   * null - has not finished checking yet
   * empty array - finished checking, no users logged in
   * non-empty array - contains logged in users
   */
  const user = useBroker("notifyUserChanged")?.user;
  const isLoadingUser = useBroker("notifyIsLoadingUser");

  const configs = useBroker("notifyFirebaseConfig", {
    initialRequest: "getInitialData",
  });
  const hasFdcConfigs =
    useBroker("notifyHasFdcConfigs", {
      initialRequest: "getInitialHasFdcConfigs",
    }) ?? false;

  const accountSection = (
    <AccountSection
      user={user}
      isMonospace={env?.isMonospace}
      isLoadingUser={isLoadingUser}
    />
  );
  // Just render the account section loading view if it doesn't know user state
  if (!user) {
    return (
      <>
        <Spacer size="medium" />
        Login to use the Firebase plugin
        <Spacer size="small" />
        {accountSection}
      </>
    );
  }
  if (!configs?.firebaseJson?.value || !hasFdcConfigs) {
    const configLabel = !hasFdcConfigs ? "dataconnect.yaml" : "firebase.json";
    return (
      <>
        {accountSection}
        <p>
          No <code>{configLabel}</code> detected in this project
        </p>
        <br />
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

  return <SidebarContent configs={configs} />;
}

function SidebarContent(props: {
  configs: {
    firebaseJson: ValueOrError<FirebaseConfig>;
    firebaseRC: ValueOrError<RCData>;
  };
}) {
  const [framework, setFramework] = useState<string | null>(null);

  const firebaseJson = props.configs?.firebaseJson;
  const firebaseRC = props.configs?.firebaseRC;

  const projectId = firebaseRC?.value?.projects?.default;

  const env = useBroker("notifyEnv")?.env;
  /**
   * null - has not finished checking yet
   * empty array - finished checking, no users logged in
   * non-empty array - contains logged in users
   */
  const user = useBroker("notifyUserChanged")?.user;

  useEffect(() => {
    webLogger.debug("loading SidebarApp component");
    broker.send("getInitialData");

    broker.on("notifyFirebaseConfig", ({ firebaseJson, firebaseRC }) => {
      webLogger.debug(
        "notifyFirebaseConfig",
        JSON.stringify(firebaseJson),
        JSON.stringify(firebaseRC),
      );
    });
  }, []);

  const accountSection = (
    <AccountSection
      user={user}
      isMonospace={env?.isMonospace}
    />
  );

  return (
    <>
      <Spacer size="medium" />
      {accountSection}
      {!!user && (
        <ProjectSection
          user={user}
          projectId={projectId}
          isMonospace={env?.isMonospace}
        />
      )}
    </>
  );
}
