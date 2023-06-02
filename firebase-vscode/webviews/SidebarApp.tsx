import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import React, { useEffect, useState } from "react";
import { Spacer } from "./components/ui/Spacer";
import { Body } from "./components/ui/Text";
import { broker } from "./globals/html-broker";
import { User } from "../../src/types/auth";
import { PanelSection } from "./components/ui/PanelSection";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import { ServiceAccountUser } from "../common/types";
import { DeployPanel } from "./components/DeployPanel";
import { HostingState } from "./webview-types";
import { ChannelWithId } from "./messaging/types";
import { webLogger } from "./globals/web-logger";

export function SidebarApp() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [hostingState, setHostingState] = useState<HostingState>(null);
  const [env, setEnv] = useState<{ isMonospace: boolean }>();
  const [channels, setChannels] = useState<ChannelWithId[]>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  /**
   * null - has not finished checking yet
   * empty array - finished checking, no users logged in
   * non-empty array - contains logged in users
   */
  const [allUsers, setAllUsers] = useState<Array<
    ServiceAccountUser | User
  > | null>(null);
  const [isHostingOnboarded, setHostingOnboarded] = useState<boolean>(false);

  useEffect(() => {
    webLogger.debug("loading SidebarApp component");
    broker.send("getEnv");
    broker.send("getUsers");
    broker.send("getFirebaseJson");
    broker.send("getSelectedProject");
    broker.send("getChannels");

    broker.on("notifyEnv", ({ env }) => {
      webLogger.debug("notifyEnv()");
      setEnv(env);
    });

    broker.on("notifyChannels", ({ channels }) => {
      webLogger.debug("notifyChannels()");
      setChannels(channels);
    });

    broker.on("notifyFirebaseConfig", ({ firebaseJson, firebaseRC }) => {
      webLogger.debug("got firebase hosting");
      if (firebaseJson?.hosting) {
        webLogger.debug("Detected hosting setup");
        setHostingOnboarded(true);
        broker.send("showMessage", {
          msg: "Auto-detected hosting setup in this folder",
        });
      } else {
        setHostingOnboarded(false);
      }

      if (firebaseRC?.projects?.default) {
        webLogger.debug("Detected project setup from existing firebaserc");
        setProjectId(firebaseRC.projects.default);
      } else {
        setProjectId(null);
      }
    });

    broker.on("notifyUsers", ({ users }) => {
      webLogger.debug("notifyUsers()");
      setAllUsers(users);
    });

    broker.on("notifyProjectChanged", ({ projectId }) => {
      webLogger.debug("Project selected", projectId);
      setProjectId(projectId);
    });

    broker.on("notifyUserChanged", ({ email }) => {
      webLogger.debug("notifyUserChanged:", email);
      setUserEmail(email);
    });

    broker.on("notifyHostingFolderReady", ({ projectId, folderPath }) => {
      webLogger.debug(`notifyHostingFolderReady: ${projectId}, ${folderPath}`);
      setHostingOnboarded(true);
    });

    broker.on("notifyHostingDeploy", ({ success }) => {
      webLogger.debug(`notifyHostingDeploy: ${success}`);
      setHostingState("deployed");
    });
  }, []);

  function setupHosting() {
    broker.send("selectAndInitHostingFolder", {
      projectId,
      email: userEmail!, // Safe to assume user email is already there
      singleAppSupport: true,
    });
  };

  const accountSection = (
    <AccountSection
      userEmail={userEmail}
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
      {!!userEmail && (
        <ProjectSection userEmail={userEmail} projectId={projectId} />
      )}
      {isHostingOnboarded && !!userEmail && !!projectId && (
        <DeployPanel
          hostingState={hostingState}
          setHostingState={setHostingState}
          projectId={projectId}
          channels={channels}
        />
      )}
      <Spacer size="large" />
      {!isHostingOnboarded && !!userEmail && !!projectId && (
        <InitFirebasePanel
          onHostingInit={() => {
            setupHosting();
          }}
        />
      )}
    </>
  );
}

function InitFirebasePanel({ onHostingInit }: { onHostingInit: Function }) {
  return (
    <PanelSection isLast>
      <Body>Choose a path below to get started</Body>
      <Spacer size="medium" />
      <VSCodeButton onClick={() => onHostingInit()}>
        Host your web app
      </VSCodeButton>
      <Spacer size="medium" />
      <Body>Free web hosting with a world-class CDN for peak performance</Body>
      <Spacer size="large" />
    </PanelSection>
  );
}
