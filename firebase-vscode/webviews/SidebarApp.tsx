import {
  VSCodeButton,
} from "@vscode/webview-ui-toolkit/react";
import React, { useEffect, useState } from "react";
import { Spacer } from "./components/ui/Spacer";
import { Body } from "./components/ui/Text";
import { broker } from "./globals/html-broker";
import { User } from "../../src/types/auth";
import { FirebaseRC } from "../../src/firebaserc";
import { PanelSection } from "./components/ui/PanelSection";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import { FirebaseConfig } from "../../src/firebaseConfig";
import { ServiceAccountUser } from "../common/types";
import { DeployPanel } from "./components/DeployPanel";
import { HostingState } from "./webview-types";
import { ChannelWithId } from "./messaging/types";

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
    console.log("loading SidebarApp component");
    broker.send("getEnv");
    broker.send("getUsers");
    broker.send("getFirebaseJson");
    broker.send("getSelectedProject");
    broker.send("getChannels");

    broker.on("notifyEnv", (env) => {
      console.log("notifyEnv()");
      setEnv(env);
    });

    broker.on("notifyChannels", (channels) => {
      console.log("notifyChannels()");
      setChannels(channels);
    });

    broker.on(
      "notifyFirebaseConfig",
      (firebaseJson: FirebaseConfig, firebaseRC: FirebaseRC) => {
        console.log("got firebase hosting", firebaseJson?.hosting);
        if (firebaseJson?.hosting) {
          console.log("Detected hosting setup");
          setHostingOnboarded(true);
          broker.send(
            "showMessage",
            "Auto-detected hosting setup in this folder"
          );
        } else {
          setHostingOnboarded(false);
        }

        if (firebaseRC?.projects?.default) {
          console.log("Detected project setup from existing firebaserc");
          setProjectId(firebaseRC.projects.default);
        } else {
          setProjectId(null);
        }
      }
    );

    broker.on("notifyUsers", (users: User[]) => {
      console.log("notifyUsers()");
      setAllUsers(users);
    });

    broker.on("notifyProjectChanged", (projectId: string) => {
      console.log("Project selected", projectId);
      setProjectId(projectId);
    });

    broker.on("notifyUserChanged", (email) => {
      console.log("notifyUserChanged:", email);
      setUserEmail(email);
    });

    broker.on("notifyHostingFolderReady", (projectId, folderPath) => {
      console.log(`notifyHostingFolderReady: ${projectId}, ${folderPath}`);
      setHostingOnboarded(true);
    });

    broker.on("notifyHostingDeploy", (success: boolean) => {
      console.log(`notifyHostingDeploy: ${success}`);
      setHostingState("deployed");
    });

    // return () => broker.delete();
  }, []);

  const setupHosting = () => {
    broker.send(
      "selectAndInitHostingFolder",
      projectId,
      userEmail!, // Safe to assume user email is already there
      true
    );
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
    return (<>
      <Spacer size="medium" />
      {accountSection}
    </>);
  }

  return (
    <>
      <Spacer size="medium" />
      {accountSection}
      {!!userEmail && <ProjectSection userEmail={userEmail} projectId={projectId} />}
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
