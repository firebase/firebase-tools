import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import style from "./data-connect-execution-configuration.entry.scss";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodePanels,
  VSCodePanelTab,
  VSCodePanelView,
  VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react";
import { broker, useBroker } from "../globals/html-broker";
import { Spacer } from "../components/ui/Spacer";
import { UserMockKind } from "../../common/messaging/protocol";

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnectExecutionArgumentsApp />);

export function DataConnectExecutionArgumentsApp() {
  function handleVariableChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    broker.send("definedDataConnectArgs", e.target.value);
  }

  const lastOperation = useBroker("notifyLastOperation");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaVariables, setText] = useState("{}");


  const updateText = broker.on("notifyDataConnectArgs" , (newArgs: string) => {
    setText(newArgs);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(0, 1);
    }
  })

  const sendRerun = () => {
    broker.send("rerunExecution");
  };

  // Due to webview-ui-toolkit adding shadow-roots, css alone is not
  // enough to customize the look of the panels.
  // We use some imperative code to manually inject some style.
  // This is not ideal, but it's the best we can do for now.
  // Those changes are needed for the textarea to fill the available
  // space, to have a good scroll behavior.
  const ref = useRef<HTMLElement | undefined>(undefined);
  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const style = document.createElement("style");
    style.append(`
    .tabpanel {
      display: grid;
      align-items: stretch;
      justify-content: stretch;
    }
    `);

    ref.current.shadowRoot!.append(style);
  }, []);

  return (
    <VSCodePanels
      // @ts-ignore, The ref parameter is incorrectly typed.
      ref={ref}
    >
      <VSCodePanelTab>VARIABLES</VSCodePanelTab>
      <VSCodePanelTab>AUTHENTICATION</VSCodePanelTab>
      <VSCodePanelView className={style.variable}>
        <textarea
          ref={textareaRef}
          value={textareaVariables}
          onChange={handleVariableChange}
          className={style.variableInput}
        ></textarea>
        <Spacer size="small"></Spacer>
        {lastOperation && (
          <VSCodeButton onClick={sendRerun}>
            Rerun last execution: {lastOperation}
          </VSCodeButton>
        )}
      </VSCodePanelView>
      <VSCodePanelView className={style.authentication}>
        <AuthUserMockForm />
      </VSCodePanelView>
    </VSCodePanels>
  );
}

function AuthUserMockForm() {
  const [selectedKind, setSelectedMockKind] = useState<UserMockKind>(
    UserMockKind.ADMIN,
  );
  const [claims, setClaims] = useState<string>(
    `{\n  "email_verified": true,\n  "sub": "exampleUserId"\n}`,
  );

  useEffect(() => {
    broker.send(
      "notifyAuthUserMockChange",
      selectedKind === UserMockKind.AUTHENTICATED
        ? {
            kind: selectedKind,
            claims: claims,
          }
        : {
            kind: selectedKind,
          },
    );
  }, [selectedKind, claims]);

  let expandedForm: JSX.Element | undefined;
  if (selectedKind === UserMockKind.AUTHENTICATED) {
    expandedForm = (
      <>
        <Spacer size="medium" />
        <span>Claim and values</span>
        <VSCodeTextArea
          resize={"vertical"}
          value={claims}
          rows={4}
          onChange={(event) => setClaims((event.target as any).value)}
        />
      </>
    );
  }

  return (
    <>
      <span>Run as</span>
      <VSCodeDropdown
        value={selectedKind}
        onChange={(event) => setSelectedMockKind((event.target as any).value)}
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
