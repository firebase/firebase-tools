import React, { ReactNode, StrictMode } from "react";
import styles from "./index.scss";

/** Generic wrapper that all webviews should be wrapped with */
export function App({ children }: { children: ReactNode }): JSX.Element {
  return (
    <StrictMode>
      <div className={styles.root}>{children}</div>
    </StrictMode>
  );
}
