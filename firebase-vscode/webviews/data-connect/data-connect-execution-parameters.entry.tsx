import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import style from "./data-connect-execution-parameters.entry.scss";
import {
  VSCodeButton,
  VSCodeDropdown,
  VSCodeOption,
  VSCodePanels,
  VSCodePanelTab,
  VSCodePanelView,
  VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react";
import { broker } from "../globals/html-broker";
import { Spacer } from "../components/ui/Spacer";
import { EXAMPLE_CLAIMS, AuthParamsKind, AuthParams, DataConnectResults } from "../../common/messaging/protocol";

const root = createRoot(document.getElementById("root")!);
root.render(<DataConnectExecutionArgumentsApp />);

export function DataConnectExecutionArgumentsApp() {
  const [variables, setVariables] = useState("{}");
  const [fixes, setFixes] = useState<string[]>([]);

  useEffect(() => {
    broker.send("defineVariables", variables);
  }, [variables]);

  useEffect(() => {
    const dispose1 = broker.on("notifyVariables", (v: {variables: string, fixes: string[]}) => {
      setVariables(v.variables);
      setFixes(v.fixes);
    });
    const dispose2 = broker.on("notifyDataConnectResults", (results: DataConnectResults) => {
      setVariables(results.variables);
      setFixes([]);
    });
    return () => {
      dispose1();
      dispose2();
    };
  }, []);

  const handleVariableChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setVariables(e.target.value);
    setFixes([]);
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
          value={variables}
          onChange={handleVariableChange}
          className={style.variableInput}
        ></textarea>
        <Spacer size="small"></Spacer>
        {fixes.length > 0 && (
          <>
            Applied Fixes:
            <ul>
              {fixes.map((fix, index) => (
                <li key={index}>{fix}</li>
              ))}
            </ul>
          </>
        )}
      </VSCodePanelView>
      <VSCodePanelView className={style.authentication}>
        <AuthParamForm />
      </VSCodePanelView>
    </VSCodePanels>
  );
}

function AuthParamForm() {
  const [selectedKind, setSelectedMockKind] = useState<AuthParamsKind>(
    AuthParamsKind.ADMIN,
  );
  const [claims, setClaims] = useState<string>(EXAMPLE_CLAIMS);

  useEffect(() => {
    const auth = selectedKind === AuthParamsKind.AUTHENTICATED
        ? {
            kind: selectedKind,
            claims: claims,
          }
        : {
            kind: selectedKind,
          };
    broker.send("defineAuthParams", auth);
  }, [selectedKind, claims]);

  function setAuthParams(auth: AuthParams) {
    setSelectedMockKind(auth.kind);
    if (auth.kind === AuthParamsKind.AUTHENTICATED) {
      setClaims(auth.claims);
    }
  }

  useEffect(() => {
    const dispose1 = broker.on("notifyAuthParams", setAuthParams);
    const dispose2 = broker.on("notifyDataConnectResults", (results: DataConnectResults) => {
      setAuthParams(results.auth);
    });
    return () => {
      dispose1();
      dispose2();
    };
  }, []);

  let expandedForm: JSX.Element | undefined;
  if (selectedKind === AuthParamsKind.AUTHENTICATED) {
    expandedForm = (
      <>
        <Spacer size="medium" />
        <span>Claim JWT</span>
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
        <VSCodeOption value={AuthParamsKind.ADMIN}>Admin</VSCodeOption>
        <VSCodeOption value={AuthParamsKind.UNAUTHENTICATED}>
          Unauthenticated
        </VSCodeOption>
        <VSCodeOption value={AuthParamsKind.AUTHENTICATED}>
          Authenticated
        </VSCodeOption>
      </VSCodeDropdown>
      {expandedForm}
    </>
  );
}
