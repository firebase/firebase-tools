import React, { useEffect, useState } from "react";
import { Spacer } from "./components/ui/Spacer";
import { broker, useBroker } from "./globals/html-broker";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import { DeployPanel } from "./components/DeployPanel";
import { HostingInitState, DeployState } from "./webview-types";
import { EmulatorPanel } from "./components/EmulatorPanel";

import { webLogger } from "./globals/web-logger";
import { InitFirebasePanel } from "./components/InitPanel";

export function SidebarApp() {
  const [deployState, setDeployState] = useState<DeployState>(null);
  const [hostingInitState, setHostingInitState] =
    useState<HostingInitState>(null);
  const [framework, setFramework] = useState<string | null>(null);

  const configs = useBroker("notifyFirebaseConfig");
  const firebaseJson = configs?.firebaseJson;
  const firebaseRC = configs?.firebaseRC;

  const projectId = firebaseRC?.value?.projects?.default;

  const env = useBroker("notifyEnv")?.env;
  /**
   * null - has not finished checking yet
   * empty array - finished checking, no users logged in
   * non-empty array - contains logged in users
   */
  const allUsers = useBroker("notifyUsers")?.users;
  const user = useBroker("notifyUserChanged")?.user;

  const channels = useBroker("notifyChannels")?.channels;

  useEffect(() => {
    webLogger.debug("loading SidebarApp component");
    broker.send("getInitialData");

    broker.on("notifyFirebaseConfig", ({ firebaseJson, firebaseRC }) => {
      webLogger.debug(
        "notifyFirebaseConfig",
        JSON.stringify(firebaseJson),
        JSON.stringify(firebaseRC),
      );
      if (firebaseJson?.value?.hosting) {
        webLogger.debug("Detected firebase.json");
        setHostingInitState("success");
        // TODO this probably should be cached, to avoid showing the message every time.
        // Even more so considering notifyFirebaseConfig fires on every "getInitialData", which could happen on user interaction.
        broker.send("showMessage", {
          msg: "Auto-detected hosting setup in this folder",
        });
      } else {
        setHostingInitState(null);
      }
    });

    broker.on(
      "notifyHostingInitDone",
      ({ success, projectId, folderPath, framework }) => {
        if (success) {
          webLogger.debug(`notifyHostingInitDone: ${projectId}, ${folderPath}`);
          setHostingInitState("success");
          if (framework) {
            setFramework(framework);
          }
        } else {
          setHostingInitState(null);
        }
      },
    );

    broker.on("notifyHostingDeploy", ({ success }) => {
      webLogger.debug(`notifyHostingDeploy: ${success}`);
      setDeployState(success ? "success" : "failure");
    });
  }, []);

  function setupHosting() {
    broker.send("selectAndInitHostingFolder", {
      projectId,
      singleAppSupport: true,
    });
  }

  const accountSection = (
    <AccountSection
      user={user}
      allUsers={allUsers}
      isMonospace={env?.isMonospace}
    />
  );
  // Just render the account section loading view if it doesn't know user state
  if (allUsers === null) {
    return (
      <>
        <Spacer size="medium" />
        {accountSection}
      </>
    );
  }

  return (
    <>
      <Spacer size="medium" />
      {accountSection}
      {!!user && (
        <ProjectSection userEmail={user.email} projectId={projectId} />
      )}
      {hostingInitState === "success" &&
        !!user &&
        !!projectId &&
        env?.isMonospace && (
          <DeployPanel
            deployState={deployState}
            setDeployState={setDeployState}
            projectId={projectId}
            channels={channels}
            framework={framework}
          />
        )}
      <Spacer size="large" />
      {hostingInitState !== "success" &&
        !!user &&
        !!projectId &&
        env?.isMonospace && (
          <InitFirebasePanel
            onHostingInit={() => {
              setupHosting();
            }}
            hostingInitState={hostingInitState}
            setHostingInitState={setHostingInitState}
          />
        )}

      {
        // Only load the emulator panel if we have a user, firebase.json and this isn't Monospace
        // The user login requirement can be removed in the future but the panel will have to
        // be restricted to full-offline emulation only.
        !!user && firebaseJson && firebaseJson.value && (
          <EmulatorPanel firebaseJson={firebaseJson.value} />
        )
      }
    </>
  );
}
