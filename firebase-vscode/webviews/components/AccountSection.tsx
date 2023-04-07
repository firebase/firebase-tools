import { VSCodeLink, VSCodeDivider, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react";
import React, { useState } from "react";
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
}: {
  userEmail: string | null;
  allUsers: Array<User | ServiceAccountUser> | null;
}) {
  const [userDropdownVisible, toggleUserDropdown] = useState(false);
  return (
      <div className={styles.accountRow}>
        <Label className={styles.accountRowLabel}>
          <Icon className={styles.accountRowIcon} slot="start" icon="account" />
          {!allUsers && (
            <>
              {"checking login "}
            </>
          )}
          {allUsers && !allUsers.length && (
            <VSCodeLink onClick={() => broker.send("addUser")}>Sign in with Google</VSCodeLink>
          )}
          {allUsers && userEmail}
        </Label>
        {!allUsers && (<Label>
          <VSCodeProgressRing />
        </Label>)}
        {allUsers && !!allUsers.length && (
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
              broker.send("requestChangeUser", user);
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
                broker.send("logout", userEmail);
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
