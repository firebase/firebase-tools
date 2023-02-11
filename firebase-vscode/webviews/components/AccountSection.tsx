import { VSCodeLink, VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import React, { useState } from "react";
import { broker } from "../globals/html-broker";
import { ConnectProject, ProjectInfo, initProjectSelection } from "./ProjectSection";
import { Icon } from "./ui/Icon";
import { IconButton } from "./ui/IconButton";
import { PopupMenu, MenuItem } from "./ui/popup-menu/PopupMenu";
import { Label } from "./ui/Text";
import { FirebaseProjectMetadata as ProjectInfoType } from "../../../src/types/project";
import styles from './AccountSection.scss';

export function AccountSection({
  userEmail,
  projectId,
  allUserEmails,
}: {
  userEmail: string | null;
  projectId: string | null | undefined;
  allUserEmails: string[];
}) {
  const [userDropdownVisible, toggleUserDropdown] = useState(false);
  return (
    <>
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
        <IconButton
          tooltip="Switch projects"
          icon="arrow-swap"
          onClick={() => initProjectSelection(userEmail)}
        />
      </div>
      <div className={styles.accountRow}>
        <Label className={styles.accountRowLabel}>
          <Icon className={styles.accountRowIcon} slot="start" icon="account" />
          {!allUserEmails.length && (
            <VSCodeLink onClick={() => broker.send("addUser")}>
              Sign in with Google
            </VSCodeLink>
          )}
          {!!allUserEmails.length && (
            <>{!userEmail ? "Loading user..." : userEmail}</>
          )}
        </Label>
        {!!allUserEmails.length && (
          <>
            <IconButton
              tooltip="Account options"
              icon="ellipsis"
              onClick={() => toggleUserDropdown(!userDropdownVisible)}
            />
            {userDropdownVisible ? (
              <UserSelectionMenu
                userEmail={userEmail}
                allUserEmails={allUserEmails}
                onClose={() => toggleUserDropdown(false)}
              />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

// TODO(roman): Convert to a better menu
function UserSelectionMenu({
  userEmail,
  allUserEmails,
  onClose,
}: {
  userEmail: string;
  allUserEmails: string[];
  onClose: Function;
}) {
  return (
    <>
      <PopupMenu show onClose={onClose}>
        <MenuItem
          onClick={() => {
            broker.send("addUser");
            onClose();
          }}
        >
          Sign in another user...
        </MenuItem>
        <VSCodeDivider />
        {allUserEmails.map((email, i) => (
          <MenuItem
            onClick={() => {
              broker.send("requestChangeUser", email);
              onClose();
            }}
            key={i}
          >
            {email}
          </MenuItem>
        ))}
        <VSCodeDivider />
        <MenuItem
          onClick={() => {
            broker.send("logout", userEmail);
            onClose();
          }}
        >
          Sign Out
        </MenuItem>
      </PopupMenu>
    </>
  );
}
