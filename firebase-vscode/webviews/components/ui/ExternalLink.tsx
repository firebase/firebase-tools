import React from "react";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import styles from "./ExternalLink.scss";

export function ExternalLink({
  href,
  children,
  prefix,
}: {
  href: string;
  children: string;
  prefix?: JSX.Element;
}) {
  return (
    <VSCodeLink className={styles.link} href={href}>
      <span className={styles.linkContent}>
        {prefix}
        <span className={styles.linkText}>{children}</span>
      </span>
    </VSCodeLink>
  );
}
