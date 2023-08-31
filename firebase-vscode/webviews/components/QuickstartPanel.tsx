import React from "react";

import { VSCodeButton } from "@vscode/webview-ui-toolkit/react";

export const QuickstartPanel = ({ onQuickstartButtonClicked }) => {
  return (
    <VSCodeButton onClick={() => onQuickstartButtonClicked()}>
      Try a Quickstart!
    </VSCodeButton>
  );
};
