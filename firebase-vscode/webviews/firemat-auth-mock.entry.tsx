import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { VSCodeDropdown, VSCodeOption, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react";
import { Spacer } from "./components/ui/Spacer";
import { broker } from "./globals/html-broker";

const root = createRoot(document.getElementById("root")!);
root.render(<Test />);

function Test() {
  return <AuthUserMockForm />;
}

type MockAuthRole = "admin" | "unauthenticated" | "authenticated";

function AuthUserMockForm() {
  const [selectedKind, setSelectedMockKind] = useState<MockAuthRole>("admin");
  const [claims, setClaims] = useState<string>(
    `{\n  "email_verified": true,\n  "sub": "exampleUserId"\n}`,
  );

  useEffect(() => {
    broker.send("notifyAuthUserMockChange", {
      kind: selectedKind,
      claims: selectedKind === "authenticated" ? claims : undefined,
    });
  }, [selectedKind, claims]);

  let expandedForm: JSX.Element | undefined;
  if (selectedKind === "authenticated") {
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
        <VSCodeOption value={"admin"}>Admin</VSCodeOption>
        <VSCodeOption value={"unauthenticated"}>Unauthenticated</VSCodeOption>
        <VSCodeOption value={"authenticated"}>authenticated</VSCodeOption>
      </VSCodeDropdown>
      {expandedForm}
    </>
  );
}
