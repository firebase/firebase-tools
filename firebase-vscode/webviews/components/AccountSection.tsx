import {
  VSCodeLink,
  VSCodeDivider,
  VSCodeProgressRing,
} from "@vscode/webview-ui-toolkit/react";
import React, { ReactElement, useState } from "react";
import { broker } from "../globals/html-broker";
import { Icon } from "./ui/Icon";
import { IconButton } from "./ui/IconButton";
import { PopupMenu, MenuItem } from "./ui/popup-menu/PopupMenu";
import { Label } from "./ui/Text";
import styles from "./AccountSection.scss";
import { ServiceAccountUser } from "../../common/types";
import { User } from "../../../src/types/auth";

export function AccountSection({
  userEmail,
  allUsers,
  isMonospace,
}: {
  userEmail: string | null;
  allUsers: Array<User | ServiceAccountUser> | null;
  isMonospace: boolean;
}) {
  const [userDropdownVisible, toggleUserDropdown] = useState(false);
  const usersLoaded = !!allUsers;
  // Default: initial users check hasn't completed
  let currentUserElement: ReactElement | string = "checking login";
  if (usersLoaded && !allUsers.length) {
    // Users loaded but no user was found
    if (isMonospace) {
      // Monospace: this is an error, should have found a workspace
      // service account
      currentUserElement = "unable to find workspace service account";
    } else {
      // VS Code: prompt user to log in with Google account
      currentUserElement = (<VSCodeLink onClick={() => broker.send("addUser")}>
      Sign in with Google
    </VSCodeLink>);
    }
  } else if (usersLoaded && allUsers.length > 0) {
    // Users loaded, at least one user was found
    if (isMonospace && userEmail === 'service_account') {
      // TODO(hsubox76): Figure out correct wording
      currentUserElement = 'workspace logged in';
    } else {
      currentUserElement = userEmail;
    }
  }
  return (
    <div className={styles.accountRow}>
      <Label className={styles.accountRowLabel}>
        <Icon className={styles.accountRowIcon} slot="start" icon="account" />
        { currentUserElement }
      </Label>
      {!usersLoaded && (
        <Label>
          <VSCodeProgressRing />
        </Label>
      )}
      {usersLoaded && allUsers.length > 0 && (
        <>
          <IconButton
            tooltip="Account options"
            icon="ellipsis"
            onClick={() => toggleUserDropdown(!userDropdownVisible)}
          />
          {userDropdownVisible ? (
            <UserSelectionMenu
              userEmail={userEmail}
              allUsers={allUsers}
              onClose={() => toggleUserDropdown(false)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

// TODO(roman): Convert to a better menu
function UserSelectionMenu({
  userEmail,
  allUsers,
  onClose,
}: {
  userEmail: string;
  allUsers: Array<User | ServiceAccountUser>;
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
        {allUsers.map((user) => (
          <MenuItem
            onClick={() => {
              broker.send("requestChangeUser", {user});
              onClose();
            }}
            key={user.email}
          >
            {user.email}
          </MenuItem>
        ))}
        <VSCodeDivider />
        {
          // You can't log out of a service account
          userEmail !== "service_account" && (
            <MenuItem
              onClick={() => {
                broker.send("logout", {email: userEmail});
                onClose();
              }}
            >
              Sign Out {userEmail}
            </MenuItem>
          )
        }
      </PopupMenu>
    </>
  );
}
