import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { broker } from "../globals/html-broker";
import React from "react";

export function initProjectSelection(userEmail: string | null) {
  if (userEmail) {
    broker.send("getProjects", userEmail);
  } else {
    // Trigger login flow
    broker.send("addUser");
  }
}

export function ConnectProject({ userEmail }: { userEmail: string | null }) {
  return (
    <>
      <VSCodeLink onClick={() => initProjectSelection(userEmail)}>
        Connect a Firebase project
      </VSCodeLink>
    </>
  );
}

export function ProjectInfo({ projectId }: { projectId: string }) {
  return (
    <>
      {projectId}
      <VSCodeLink
        href={`https://console.firebase.google.com/project/${projectId}/overview`}
      >
        Open in Firebase Console
      </VSCodeLink>
    </>
  );
}