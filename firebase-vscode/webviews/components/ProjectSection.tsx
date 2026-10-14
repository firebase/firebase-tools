import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { broker } from "../globals/html-broker";
import { IconButton } from "./ui/IconButton";
import { Icon } from "./ui/Icon";
import { Label } from "./ui/Text";
import React from "react";
import styles from "./AccountSection.scss";
import { ExternalLink } from "./ui/ExternalLink";
import { TEXT } from "../globals/ux-text";
import { User } from "../types/auth";
import { ServiceAccountUser } from "../types";

interface UserWithType extends User {
  type?: string;
}
export function ProjectSection({
  user,
  projectId,
  isMonospace,
}: {
  user: UserWithType | ServiceAccountUser | null;
  projectId: string | null | undefined;
  isMonospace: boolean;
}) {
  const userEmail = user?.email;

  if (!userEmail || (isMonospace && user?.type === "service_account")) {
    return;
  }
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
        modal: !process.env.VSCODE_TEST_MODE,
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
      >
        {TEXT.CONSOLE_LINK_DESCRIPTION}
      </ExternalLink>
    </>
  );
}
