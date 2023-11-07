import React, { useEffect, useState } from "react";
import { Spacer } from "./components/ui/Spacer";
import { broker } from "./globals/html-broker";
import { User } from "../../src/types/auth";
import { AccountSection } from "./components/AccountSection";
import { ProjectSection } from "./components/ProjectSection";
import { FirebaseConfig } from "../../src/firebaseConfig";
import { ServiceAccountUser } from "../common/types";
import { DeployPanel } from "./components/DeployPanel";
import { HostingInitState, DeployState } from "./webview-types";
import { ChannelWithId } from "./messaging/types";
import { EmulatorPanel } from "./components/EmulatorPanel";

import { webLogger } from "./globals/web-logger";
import { InitFirebasePanel } from "./components/InitPanel";
import { QuickstartPanel } from "./components/QuickstartPanel";

export function SidebarApp() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [deployState, setDeployState] = useState<DeployState>(null);
  const [hostingInitState, setHostingInitState] =
    useState<HostingInitState>(null);
  const [env, setEnv] = useState<{ isMonospace: boolean }>();
  const [channels, setChannels] = useState<ChannelWithId[]>(null);
  const [user, setUser] = useState<User | ServiceAccountUser | null>(null);
  const [framework, setFramework] = useState<string | null>(null);

  /**
   * null - has not finished checking yet
   * empty array - finished checking, no users logged in
   * non-empty array - contains logged in users
   */
  const [allUsers, setAllUsers] = useState<Array<
    ServiceAccountUser | User
  > | null>(null);
  const [firebaseJson, setFirebaseJson] = useState<FirebaseConfig>();

  useEffect(() => {
    webLogger.debug("loading SidebarApp component");
    broker.send("getInitialData");

    broker.on("notifyEnv", ({ env }) => {
      webLogger.debug(`notifyEnv() returned ${JSON.stringify(env)}`);
      setEnv(env);
    });

    broker.on("notifyChannels", ({ channels }) => {
      webLogger.debug(`notifyChannels() returned ${JSON.stringify(channels)}`);
      setChannels(channels);
    });

    broker.on("notifyFirebaseConfig", ({ firebaseJson, firebaseRC }) => {
      webLogger.debug(
        "got firebase hosting",
        JSON.stringify(firebaseJson?.hosting)
      );
      if (firebaseJson) {
        setFirebaseJson(firebaseJson);
        webLogger.debug("set firebase JSON");
      }
      if (firebaseJson?.hosting) {
        webLogger.debug("Detected firebase.json");
        setHostingInitState("success");
        broker.send("showMessage", {
          msg: "Auto-detected hosting setup in this folder",
        });
      } else {
        setHostingInitState(null);
      }

      if (firebaseRC?.projects?.default) {
        webLogger.debug("Detected project setup from existing firebaserc");
        setProjectId(firebaseRC.projects.default);
      } else {
        setProjectId(null);
      }
    });

    broker.on("notifyUsers", ({ users }) => {
      webLogger.debug(`notifyUsers() returned ${JSON.stringify(users)}`);
      setAllUsers(users);
    });

    broker.on("notifyProjectChanged", ({ projectId }) => {
      webLogger.debug("Project selected", projectId);
      setProjectId(projectId);
    });

    broker.on("notifyUserChanged", ({ user }) => {
      webLogger.debug("notifyUserChanged:", user?.email);
      setUser(user);
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
      }
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
      {hostingInitState === "success" && !!user && !!projectId && (
        <DeployPanel
          deployState={deployState}
          setDeployState={setDeployState}
          projectId={projectId}
          channels={channels}
          framework={framework}
        />
      )}
      <Spacer size="large" />
      {hostingInitState !== "success" && !!user && !!projectId && (
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
        !!user && !!firebaseJson && !env?.isMonospace && (
          <EmulatorPanel firebaseJson={firebaseJson} projectId={projectId} />
        )
      }
      {
        // Only load quickstart panel if this isn't a Monospace workspace
        !env?.isMonospace && (
          <>
            <Spacer size="medium" />
            <QuickstartPanel
              onQuickstartButtonClicked={() =>
                broker.send("chooseQuickstartDir", {})
              }
            />
          </>
        )
      }
    </>
  );
}
