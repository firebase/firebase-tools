import {
  VSCodeButton,
  VSCodeDivider,
  VSCodeProgressRing,
  VSCodeLink,
} from "@vscode/webview-ui-toolkit/react";
import cn from "classnames";
import React, { useEffect, useState } from "react";
import { Icon } from "./components/ui/Icon";
import { Spacer } from "./components/ui/Spacer";
import { Body, Label } from "./components/ui/Text";
import { broker } from "./globals/html-broker";
import styles from "./sidebar.entry.scss";
import { User } from "../../src/types/auth";
import { FirebaseRC } from "../../src/firebaserc";
import { PanelSection } from "./components/ui/PanelSection";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import { FirebaseConfig } from "../../src/firebaseConfig";
import { ServiceAccountUser } from "../common/types";

export function SidebarApp() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [hostingState, setHostingState] = useState<
    null | "deploying" | "deployed"
  >(null);
  const [env, setEnv] = useState<{ isMonospace: boolean }>();
  const [userEmail, setUserEmail] = useState<string | null>(null);
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

    broker.on("notifyEnv", (env) => {
      console.log("notifyEnv()");
      setEnv(env);
    });

    broker.on(
      "notifyFirebaseJson",
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

  const accountSection = env && !env.isMonospace && (
    <AccountSection userEmail={userEmail} allUsers={allUsers} />
  );

  // Just render the account section loading view if it doesn't know user state
  if (allUsers === null) {
    return accountSection;
  }

  return (
    <>
      <Spacer size="medium" />
      {accountSection}
      <ProjectSection userEmail={userEmail} projectId={projectId} />
      {isHostingOnboarded && !!projectId && (
        <>
          <VSCodeDivider style={{ width: "100vw" }} />
          <Spacer size="medium" />
          <PanelSection title="Hosting">
            <>
              <VSCodeButton
                disabled={hostingState === "deploying"}
                onClick={() => {
                  setHostingState("deploying");
                  broker.send("hostingDeploy");
                }}
              >
                Deploy to Firebase Hosting
              </VSCodeButton>
              {hostingState === null && (
                <>
                  <Spacer size="xsmall" />
                  <div>
                    <Label level={3} className={styles.hostingRowLabel}>
                      <Spacer size="xsmall" />
                      <Icon
                        className={styles.hostingRowIcon}
                        slot="start"
                        icon="globe"
                      ></Icon>
                      {projectId}.web.app
                    </Label>
                  </div>
                </>
              )}
              {hostingState === "deploying" && (
                <>
                  <Spacer size="medium" />
                  <div className={styles.integrationStatus}>
                    <VSCodeProgressRing
                      className={cn(
                        styles.integrationStatusIcon,
                        styles.integrationStatusLoading
                      )}
                    />
                    <Label level={3}> Deploying...</Label>
                  </div>
                </>
              )}
              {hostingState === "deployed" && (
                <>
                  <Spacer size="medium" />
                  <Label level={3} className={styles.hostingRowLabel}>
                    <Spacer size="xsmall" />
                    <Icon
                      className={styles.hostingRowIcon}
                      slot="start"
                      icon="globe"
                    ></Icon>
                    <VSCodeLink href={`https://${projectId}.web.app`}>
                      {projectId}.web.app
                    </VSCodeLink>
                  </Label>
                </>
              )}
            </>
          </PanelSection>
        </>
      )}
      <Spacer size="large" />
      {!isHostingOnboarded && (
        <InitFirebase
          onHostingInit={() => {
            if (!userEmail) {
              broker.send("showMessage", "Not logged in", {
                modal: true,
                detail: `Log in by clicking "Sign in with Google" in the sidebar.`,
              });
              return;
            }
            if (!projectId) {
              broker.send("showMessage", "No project selected", {
                modal: true,
                detail: `Select a project in the sidebar.`,
              });
              return;
            }
            setupHosting();
          }}
        />
      )}
    </>
  );
}

function InitFirebase({ onHostingInit }: { onHostingInit: Function }) {
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
