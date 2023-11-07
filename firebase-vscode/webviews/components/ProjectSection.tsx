import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { broker } from "../globals/html-broker";
import { IconButton } from "./ui/IconButton";
import { Icon } from "./ui/Icon";
import { Label } from "./ui/Text";
import React from "react";
import styles from "./AccountSection.scss";
import { ExternalLink } from "./ui/ExternalLink";
import { TEXT } from "../globals/ux-text";

export function ProjectSection({
  userEmail,
  projectId,
}: {
  userEmail: string | null;
  projectId: string | null | undefined;
}) {
  return (
    <div className={styles.accountRow}>
      <Label className={styles.accountRowLabel}>
        <Icon
          className={styles.accountRowIcon}
          slot="start"
          icon="symbol-method"
        />
        <div className={styles.accountRowProject}>
          {!projectId ? (
            <ConnectProject userEmail={userEmail} />
          ) : (
            <ProjectInfo projectId={projectId} />
          )}
        </div>
      </Label>
      {!!projectId && (
        <IconButton
          tooltip="Switch projects"
          icon="arrow-swap"
          onClick={() => initProjectSelection(userEmail)}
        />
      )}
    </div>
  );
}

export function initProjectSelection(userEmail: string | null) {
  if (userEmail) {
    broker.send("selectProject");
  } else {
    broker.send("showMessage", {
      msg: "Not logged in",
      options: {
        modal: true,
        detail: `Log in to allow project selection. Click "Sign in with Google" in the sidebar.`,
      },
    });
    return;
  }
}

export function ConnectProject({ userEmail }: { userEmail: string | null }) {
  return (
    <>
      <VSCodeLink onClick={() => initProjectSelection(userEmail)}>
        {TEXT.CONNECT_FIREBASE_PROJECT}
      </VSCodeLink>
    </>
  );
}

export function ProjectInfo({ projectId }: { projectId: string }) {
  return (
    <>
      {projectId}
      <ExternalLink
        href={`https://console.firebase.google.com/project/${projectId}/overview`}
        text={TEXT.CONSOLE_LINK_DESCRIPTION}
      />
    </>
  );
}
