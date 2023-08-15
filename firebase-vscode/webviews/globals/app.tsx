import React, { ReactNode, StrictMode } from "react";
import { ExtensionStateProvider } from "./extension-state";

export function App({ children }: { children: ReactNode }): JSX.Element {
  return (
    <StrictMode>
      <ExtensionStateProvider>{children}</ExtensionStateProvider>
    </StrictMode>
  );
}
