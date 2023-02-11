import {
  VSCodeButton,
  VSCodeDivider,
  VSCodeProgressRing,
  VSCodeLink,
} from "@vscode/webview-ui-toolkit/react";
import cn from "classnames";
import React, { useEffect, useState } from "react";
import { FirebaseProjectMetadata as ProjectInfoType } from "../../src/types/project";
import { Icon } from "./components/ui/Icon";
import { Spacer } from "./components/ui/Spacer";
import { Body, Label } from "./components/ui/Text";
import { broker } from "./globals/html-broker";
import styles from "./sidebar.entry.scss";
import { User } from "../../src/types/auth";
import { FirebaseRC } from "../../src/firebaserc";
import { PanelSection } from "./components/ui/PanelSection";
import { AccountSection } from "./components/AccountSection";
import { initProjectSelection } from "./components/ProjectSection";
import { FirebaseConfig } from "../../src/firebaseConfig";

export function SidebarApp() {
  let [projectId, setProjectId] = useState<string | null>(null);
  let [hostingState, setHostingState] = useState<
    null | "deploying" | "deployed"
  >(null);
  let [userEmail, setUserEmail] = useState<string | null>(null);
  let [allUsers, setAllUserEmails] = useState<string[]>([]);
  let [isHostingOnboarded, setHostingOnboarded] = useState<boolean>(false);

  useEffect(() => {
    console.log('loading SidebarApp component');
    broker.send("getUsers");
    broker.send("getFirebaseJson");
    broker.send("getSelectedProject");

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

        if (firebaseRC.projects?.default) {
          console.log("Detected project setup from existing firebaserc");
          setProjectId(firebaseRC.projects.default);
        } else {
          setProjectId(null);
        }
      }
    );

    broker.on("notifyUsers", (users: User[]) => {
      console.log('notifyUsers()');
      setAllUserEmails(users.map((user) => user.email));
    });

    broker.on("notifyProjects", (email: string, projects: ProjectInfoType[]) => {
      console.log(`${projects.length} projects found for ${email}`);
      broker.send("projectPicker", projects);
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
    if (projectId && userEmail) {
      broker.send(
        "selectAndInitHostingFolder",
        projectId,
        userEmail!, // Safe to assume user email is already there
        true
      );
    }
  };

  return (
    <>
      <Spacer size="medium" />
      <AccountSection
        userEmail={userEmail}
        allUserEmails={allUsers}
        projectId={projectId}
      />

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
                    <VSCodeLink
                      href={`https://${projectId}.web.app`}
                    >
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
      <MoreFromFirebase
        isStart={!isHostingOnboarded}
        onHostingInit={() => {
          if (projectId && userEmail) {
            setupHosting();
          } else {
            initProjectSelection(userEmail);
            /** The second thing doesn't actually happen I think it needs to await the first thing being done */
            setupHosting();
          }
        }}
      />
    </>
  );
}

function MoreFromFirebase({
  isStart,
  onHostingInit,
}: {
  isStart: boolean;
  onHostingInit: Function;
}) {
  return (
    <>
      <PanelSection title={isStart ? null : "More Integrations"} isLast>
        {isStart && (
          <>
            <Body>Choose a path below to get started</Body>
            <Spacer size="medium" />
            <VSCodeButton onClick={() => onHostingInit()}>
              Host your web app
            </VSCodeButton>
            <Spacer size="medium" />
            <Body>
              Free web hosting with a world-class CDN for peak performance
            </Body>
            <Spacer size="large" />
          </>
        )}
        {/* <VSCodeButton onClick={() => {}}>Store data in the cloud</VSCodeButton>
        <Spacer size="medium" />
        <Body>
          With Firestore, a realtime, NoSQL database accessible from Javascript
        </Body>
        <Spacer size="large" />

        <VSCodeButton onClick={() => {}}>Monitor web performance</VSCodeButton>
        <Spacer size="medium" />
        <Body>
          Understand key web app metrics like FCP with Firebase Performance
          Monitoring
        </Body>
        <Spacer size="large" />

        <VSCodeButton onClick={() => {}}>Build microservices</VSCodeButton>
        <Spacer size="medium" />
        <Body>Auto-scaling compute in the cloud with Firebase Functions</Body> */}
      </PanelSection>
    </>
  );
}

