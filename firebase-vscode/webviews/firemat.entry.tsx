import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import { broker } from "./globals/html-broker";
import styles from "./globals/index.scss";
import { UserMockKind } from "../common/messaging/protocol";
import { TEXT } from "./globals/ux-text";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<Firemat />);

function Firemat() {
  return (
    <>
      <Spacer size="small" />
      <VSCodeButton>{TEXT.DEPLOY_FIREMAT}</VSCodeButton>
      <Spacer size="xlarge" />
      <VSCodeButton>{TEXT.CONNECT_TO_INSTANCE}</VSCodeButton>
    </>
  );
}
