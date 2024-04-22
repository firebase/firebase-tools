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
import { TEXT } from "../globals/ux-text";

interface UserWithType extends User {
  type?: string;
}

export function AccountSection({
  user,
  allUsers,
  isMonospace,
}: {
  user: UserWithType | ServiceAccountUser | null;
  allUsers: Array<User | ServiceAccountUser> | null;
  isMonospace: boolean;
}) {
  const [userDropdownVisible, toggleUserDropdown] = useState(false);
  const usersLoaded = !!allUsers;
  // Default: initial users check hasn't completed
  let currentUserElement: ReactElement | string = TEXT.LOGIN_PROGRESS;
  if (usersLoaded && (!allUsers.length || !user)) {
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
  } else if (usersLoaded && allUsers.length > 0) {
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
              isMonospace={isMonospace}
              user={user}
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
  user,
  allUsers,
  onClose,
  isMonospace,
}: {
  user: UserWithType | ServiceAccountUser;
  allUsers: Array<User | ServiceAccountUser>;
  onClose: Function;
  isMonospace: boolean;
}) {
  const hasNonServiceAccountUser = allUsers.some(
    (user) => (user as ServiceAccountUser).type !== "service_account"
  );
  const allUsersSorted = [...allUsers].sort((user1, user2) =>
    (user1 as ServiceAccountUser).type !== "service_account" ? -1 : 1
  );
  /**
   * Some temporary fixes here to not show google signin option in
   * Monospace. This includes not showing "Default credentials" as
   * a selectable dropdown option since there shouldn't be any other
   * options. Instead, show the "show service account email" option
   * and show it in a primary text size.
   * If google signin in Monospace is solved, these can be reverted.
   */
  return (
    <>
      <PopupMenu show onClose={onClose} autoClose={true}>
        {!isMonospace && (
          <MenuItem
            onClick={() => {
              broker.send("addUser");
              onClose();
            }}
          >
            {hasNonServiceAccountUser
              ? TEXT.ADDITIONAL_USER_SIGN_IN
              : TEXT.GOOGLE_SIGN_IN}
          </MenuItem>
        )}
        {!isMonospace && <VSCodeDivider />}
        {allUsersSorted.map((user: UserWithType | ServiceAccountUser) => (
          <>
            {!isMonospace && (
              <MenuItem
                onClick={() => {
                  broker.send("requestChangeUser", { user });
                  onClose();
                }}
                key={user.email}
              >
                {user?.type === "service_account"
                  ? isMonospace
                    ? TEXT.MONOSPACE_LOGIN_SELECTION_ITEM
                    : TEXT.VSCE_SERVICE_ACCOUNT_SELECTION_ITEM
                  : user.email}
              </MenuItem>
            )}
            {user?.type === "service_account" && (
              <MenuItem
                onClick={() => {
                  broker.send("showMessage", {
                    msg: `Service account email: ${user.email}`,
                    options: {
                      modal: true,
                    },
                  });
                  onClose();
                }}
                key="service-account-email"
              >
                <Label level={isMonospace ? 3 : 2}>
                  {TEXT.SHOW_SERVICE_ACCOUNT}
                </Label>
              </MenuItem>
            )}
          </>
        ))}
        {
          // You can't log out of a service account
          user.type !== "service_account" && (
            <>
              <VSCodeDivider />
              <MenuItem
                onClick={() => {
                  broker.send("logout", { email: user.email });
                  onClose();
                }}
              >
                Sign Out {user.email}
              </MenuItem>
            </>
          )
        }
      </PopupMenu>
    </>
  );
}
