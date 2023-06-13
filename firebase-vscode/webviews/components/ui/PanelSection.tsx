import { VSCodeDivider } from "@vscode/webview-ui-toolkit/react";
import React, { ReactNode, useState } from "react";
import { Icon } from "./Icon";
import { Spacer } from "./Spacer";
import { Heading } from "./Text";
import cn from "classnames";
import styles from "./PanelSection.scss";

export function PanelSection({
  title,
  children,
  isLast,
}: {
  title?: ReactNode;
  children: ReactNode;
  isLast?: boolean;
}) {
  let [isExpanded, setExpanded] = useState(true);

  return (
    <>
      {title && (
        <button
          aria-label={(isExpanded ? "Hide" : "Toggle") + " " + title}
          className={cn(styles.panelExpando, isExpanded && styles.isExpanded)}
          onClick={() => setExpanded(!isExpanded)}
        >
          <Icon className={styles.panelExpandoIcon} icon="chevron-down" />
          <Heading level={5}>{title}</Heading>
        </button>
      )}
      {isExpanded && (
        <>
          {title && <Spacer size="medium" />}
          {children}
          <Spacer size="xlarge" />
          {!isLast && <VSCodeDivider style={{ width: "100vw" }} />}
        </>
      )}
    </>
  );
}
