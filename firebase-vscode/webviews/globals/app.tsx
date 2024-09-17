import React, { ReactNode, StrictMode } from "react";
import { ExtensionStateProvider } from "./extension-state";

/** Generic wrapper that all webviews should be wrapped with */
export function App({ children }: { children: ReactNode }): JSX.Element {
  return (
    <StrictMode>
      <ExtensionStateProvider>{children}</ExtensionStateProvider>
    </StrictMode>
  );
}
