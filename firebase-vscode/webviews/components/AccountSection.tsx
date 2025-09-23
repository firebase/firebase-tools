import {
  VSCodeLink,
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
import { TEXT } from "../globals/ux-text";

interface UserWithType extends User {
  type?: string;
}

export function AccountSection({
  user,
  isMonospace,
  isLoadingUser,
}: {
  user: UserWithType | ServiceAccountUser | null;
  isMonospace: boolean;
  isLoadingUser: boolean;
}) {
  const [userDropdownVisible, toggleUserDropdown] = useState(false);

  // Default: initial users check hasn't completed
  let currentUserElement: ReactElement | string = (<>{TEXT.LOGIN_IN_PROGRESS}<VSCodeProgressRing /></>);
  if (!isLoadingUser) {
    if (!user) {
      // Users loaded but no user was found
      if (isMonospace) {
        // Monospace: this is an error, should have found a workspace
        // service account
        currentUserElement = TEXT.MONOSPACE_LOGIN_FAIL;
      } else {
        // VS Code: prompt user to log in with Google account
        currentUserElement = (
          <VSCodeLink onClick={() => broker.send("addUser")}>
            {TEXT.GOOGLE_SIGN_IN}
          </VSCodeLink>
        );
      }
    } else if (user) {
      // Users loaded, at least one user was found
      if (user.type === "service_account") {
        if (isMonospace) {
          currentUserElement = TEXT.MONOSPACE_LOGGED_IN;
        } else {
          currentUserElement = TEXT.VSCE_SERVICE_ACCOUNT_LOGGED_IN;
        }
      } else {
        currentUserElement = user.email;
      }
    }
  }
  
  let userBoxElement = (
    <Label className={styles.accountRowLabel}>
      <Icon className={styles.accountRowIcon} slot="start" icon="account" />
      {currentUserElement}
    </Label>
  );
  if (user?.type === "service_account" && isMonospace) {
    userBoxElement = (
      <Label level={4} secondary className={styles.accountRowLabel}>
        {currentUserElement}
      </Label>
    );
  }
  return (
    <div className={styles.accountRow}>
      {userBoxElement}
      {
        // Logout menu. Can't logout in monospace

        user && !isMonospace && (
          <>
            <IconButton
              tooltip="Account options"
              icon="ellipsis"
              onClick={() => toggleUserDropdown(!userDropdownVisible)}
            />
            {userDropdownVisible ? (
              <LogoutMenu
                user={user}
                onClose={() => toggleUserDropdown(false)}
              />
            ) : null}
          </>
        )
      }
    </div>
  );
}

function LogoutMenu({
  user,
  onClose,
}: {
  user: UserWithType | ServiceAccountUser;
  onClose: Function;
}) {
  return (
    <>
      <PopupMenu show onClose={onClose} autoClose={true}>
        <>
          <MenuItem
            onClick={() => {
              broker.send("logout", { email: user.email });
              onClose();
            }}
          >
            Sign Out {user.email}
          </MenuItem>
        </>
      </PopupMenu>
    </>
  );
}
