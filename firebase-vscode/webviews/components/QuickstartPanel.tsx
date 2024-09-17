import React from "react";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

export const QuickstartPanel = ({ onQuickstartButtonClicked }: any) => {
  return (
    <VSCodeButton onClick={() => onQuickstartButtonClicked()}>
      Try a Quickstart!
    </VSCodeButton>
  );
};
