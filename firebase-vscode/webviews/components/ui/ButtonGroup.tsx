import React, { ReactNode } from "react";
import styles from "./ButtonGroup.scss";

export function ButtonGroup({ children }: { children: ReactNode }) {
  return <div className={styles.buttonGroup}>{children}</div>;
}
