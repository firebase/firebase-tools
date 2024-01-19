import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import { broker } from "./globals/html-broker";
import styles from "./globals/index.scss";
import { UserMockKind } from "../common/messaging/protocol";

// Prevent webpack from removing the `style` import above
styles;

const root = createRoot(document.getElementById("root")!);
root.render(<Test />);

function Test() {
  return <AuthUserMockForm />;
}

function AuthUserMockForm() {
  const [selectedKind, setSelectedMockKind] = useState<UserMockKind>(
    UserMockKind.ADMIN
  );
  const [claims, setClaims] = useState<string>(
    `{\n  "email_verified": true,\n  "sub": "exampleUserId"\n}`
  );

  useEffect(() => {
    broker.send("notifyAuthUserMockChange", {
      kind: selectedKind,
      claims: selectedKind === UserMockKind.AUTHENTICATED ? claims : undefined,
    });
  }, [selectedKind, claims]);

  let expandedForm: JSX.Element | undefined;
  if (selectedKind === UserMockKind.AUTHENTICATED) {
    expandedForm = (
      <>
        <Spacer size="medium" />
        <span>Auth claims</span>
        <VSCodeTextArea
          resize={"vertical"}
          value={claims}
          rows={4}
          onChange={(event) => setClaims(event.target.value)}
        />
      </>
    );
  }

  return (
    <>
      <span>Authentication mode</span>
      <VSCodeDropdown
        value={selectedKind}
        onChange={(event) => setSelectedMockKind(event.target.value)}
      >
        <VSCodeOption value={UserMockKind.ADMIN}>Admin</VSCodeOption>
        <VSCodeOption value={UserMockKind.UNAUTHENTICATED}>
          Unauthenticated
        </VSCodeOption>
        <VSCodeOption value={UserMockKind.AUTHENTICATED}>
          Authenticated
        </VSCodeOption>
      </VSCodeDropdown>
      {expandedForm}
    </>
  );
}
