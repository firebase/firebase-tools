import cn from "classnames";
import React, { FC, HTMLAttributes, PropsWithChildren } from "react";
import styles from "./PopupMenu.scss";

// TODO(hsubox76): replace this with a real, accessible Menu component

type PopupMenuProps<T> = PropsWithChildren<
  T &
    HTMLAttributes<HTMLElement> & {
      show?: boolean;
      onClose: Function;
      autoClose: boolean;
    }
>;

export const PopupMenu: FC<PopupMenuProps<{}>> = ({
  children,
  autoClose,
  className,
  show,
  onClose,
}) => {
  return (
    <>
      {show && (
        <>
          <div className={styles.scrim} onClick={() => onClose()} />
          <ul
            style={{ left: "auto", top: "auto" }}
            className={cn(className, styles.menu)}
            onClick={() => {
              autoClose && onClose();
            }}
          >
            {children}
          </ul>
        </>
      )}
    </>
  );
};

type MenuItemProps<T> = PropsWithChildren<
  T &
    HTMLAttributes<HTMLElement> & {
      onClick: Function;
    }
>;

export const MenuItem: FC<MenuItemProps<{}>> = ({
  className,
  onClick,
  children,
}) => {
  return (
    <li>
      <button className={cn(className, styles.item)} onClick={onClick}>
        {children}
      </button>
    </li>
  );
};
