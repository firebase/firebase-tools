import React, { ReactNode, StrictMode } from "react";

/** Generic wrapper that all webviews should be wrapped with */
export function App({ children }: { children: ReactNode }): JSX.Element {
  return <StrictMode>{children}</StrictMode>;
}
