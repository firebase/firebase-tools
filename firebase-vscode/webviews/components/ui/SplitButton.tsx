import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";
import cn from "classnames";
import React, { HTMLAttributes, PropsWithChildren, useState } from "react";
import { Icon } from "./Icon";
import styles from "./SplitButton.scss";
import { PopupMenu } from "./popup-menu/PopupMenu";

type SplitButtonProps = PropsWithChildren<
  HTMLAttributes<HTMLElement> & {
    appearance?: "primary" | "secondary";
    onClick: Function;
    popupMenuContent: React.ReactNode;
  }
>;

export const SplitButton: React.FC<SplitButtonProps> = ({
  children,
  onClick,
  className,
  popupMenuContent,
  appearance,
  ...props
}) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className={cn(className, styles.splitButton)}>
        {menuOpen && (
          <PopupMenu autoClose show onClose={() => setMenuOpen(false)}>
            {popupMenuContent}
          </PopupMenu>
        )}
        <VSCodeButton
          className={styles.mainTarget}
          onClick={onClick}
          appearance={appearance || "secondary"}
          {...(props as any)}
        >
          {children}
        </VSCodeButton>
        <VSCodeButton
          className={styles.menuTarget}
          onClick={() => setMenuOpen(true)}
          appearance={appearance || "secondary"}
          {...(props as any)}
        >
          <Icon icon="chevron-down" />
        </VSCodeButton>
      </div>
    </>
  );
};
