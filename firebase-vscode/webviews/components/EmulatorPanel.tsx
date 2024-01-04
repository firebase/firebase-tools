import {
  VSCodeButton,
  VSCodeLink,
  VSCodeTextField,
  VSCodeDropdown,
  VSCodeOption,
  VSCodeTextArea,
} from "@vscode/webview-ui-toolkit/react";
import React, { useEffect, useState } from "react";
import { Spacer } from "./ui/Spacer";
import { broker, useBrokerListener } from "../globals/html-broker";
import { PanelSection } from "./ui/PanelSection";
import { FirebaseConfig } from "../../../src/firebaseConfig";
import {
  RunningEmulatorInfo,
  EmulatorUiSelections,
} from "../../common/messaging/types";
import { EmulatorInfo, Emulators } from "../../../src/emulator/types";
import { webLogger } from "../globals/web-logger";

const DEFAULT_EMULATOR_UI_SELECTIONS: EmulatorUiSelections = {
  projectId: "demo-something",
  importStateFolderPath: "",
  exportStateOnExit: false,
  mode: "firemat",
  debugLogging: false,
};

/**
 * Emulator panel component for the VSCode extension. Handles start/stop,  import/export.
 */
export function EmulatorPanel({
  firebaseJson,
  projectId,
}: {
  firebaseJson: FirebaseConfig;
  projectId?: string | undefined;
}) {
  if (!firebaseJson) {
    throw Error("Expected a valid FirebaseConfig.");
  }
  const defaultState = DEFAULT_EMULATOR_UI_SELECTIONS;
  if (projectId) {
    defaultState.projectId = getProjectIdForMode(projectId, defaultState.mode);
  }
  const [emulatorUiSelections, setEmulatorUiSelections] =
    useState<EmulatorUiSelections>(defaultState);

  useEffect(() => {
    webLogger.debug(
      "initial state ui selections:" + JSON.stringify(emulatorUiSelections),
    );
  }, [emulatorUiSelections]);

  function setEmulatorUiSelectionsAndSaveToWorkspace(
    uiSelections: EmulatorUiSelections,
  ) {
    // TODO(christhompson): Save UI selections in the current workspace.
    // Requires context object.
    setEmulatorUiSelections(uiSelections);
  }
  const [showEmulatorProgressIndicator, setShowEmulatorProgressIndicator] =
    useState<boolean>(false);

  // TODO(christhompson): Load UI selections from the current workspace.
  // Requires context object.
  // TODO(christhompson): Check if the emulators are running on extension start.
  const [runningEmulatorInfo, setRunningEmulatorInfo] =
    useState<RunningEmulatorInfo>();

  useBrokerListener("notifyEmulatorsStopped", () => {
    setShowEmulatorProgressIndicator(false);
    webLogger.debug(`notifyEmulatorsStopped received in sidebar`);
    setRunningEmulatorInfo(null);

    // When the emulator stops, clear the firemat endpoint.
    // This ensures that the following query executions will fail with a
    // "No emulator running" instead of "Failed to connect to <endpoint>".
    broker.send("notifyFirematEmulatorEndpoint", { endpoint: undefined });
  });

  useBrokerListener("notifyEmulatorStartFailed", () => {
    setShowEmulatorProgressIndicator(false);
    webLogger.debug(`notifyEmulatorStartFailed received in sidebar`);
  });

  useBrokerListener(
    "notifyRunningEmulatorInfo",
    (info: RunningEmulatorInfo) => {
      setShowEmulatorProgressIndicator(false);
      webLogger.debug(`notifyRunningEmulatorInfo received in sidebar`);
      setRunningEmulatorInfo(info);

      let endpoint = "";
      // TODO: should this logic be here?
      // send firemat endpoint
      for (const emulatorInfo of info.displayInfo) {
        if (emulatorInfo.name === Emulators.FIREMAT) {
          endpoint = "http://" + emulatorInfo.host + ":" + emulatorInfo.port;
        }
      }
      webLogger.debug(`notifyFirematEmulatorEndpoint sending: `, endpoint);
      broker.send("notifyFirematEmulatorEndpoint", { endpoint });
    },
  );

  useBrokerListener("notifyEmulatorImportFolder", ({ folder }) => {
    webLogger.debug(
      `notifyEmulatorImportFolder received in sidebar: ${folder}`,
    );
    const newSelections = {
      ...emulatorUiSelections,
      importStateFolderPath: folder,
    };
    setEmulatorUiSelectionsAndSaveToWorkspace(newSelections);
  });

  function launchEmulators() {
    if (!emulatorUiSelections.projectId) {
      broker.send("showMessage", {
        msg: "Missing project ID",
        options: {
          modal: true,
          detail: `Please specify a project ID before starting the emulator suite.`,
        },
      });
      return;
    }
    if (!firebaseJson) {
      // TODO(christhompson): Consider using a default config in the case that
      // firebase.json doesn't exist.
      broker.send("showMessage", {
        msg: "Missing firebase.json",
        options: {
          modal: true,
          detail: `Unable to find firebase.json file.`,
        },
      });
      return;
    }
    setShowEmulatorProgressIndicator(true);
    broker.send("launchEmulators", {
      emulatorUiSelections,
    });
  }

  function stopEmulators() {
    setShowEmulatorProgressIndicator(true);
    broker.send("stopEmulators");
  }

  function projectIdChanged(event: React.ChangeEvent<HTMLInputElement>) {
    webLogger.debug("projectIdChanged: " + event.target.value);
    const selections: EmulatorUiSelections = emulatorUiSelections;
    selections.projectId = event.target.value;
    setEmulatorUiSelectionsAndSaveToWorkspace(selections);
  }

  return (
    <PanelSection
      title="Emulators"
      style={{
        // Align with the other panels.
        marginLeft: "calc(var(--container-padding) * -1)",
      }}
    >
      {/* TODO(christhompson): Insert some education links or tooltips here. */}
      Current project ID:
      {/* TODO(christhompson): convert this into a demo- prefix checkbox or something. */}
      <VSCodeTextField
        disabled={true}
        className="in-line"
        value={emulatorUiSelections.projectId}
        onChange={(event) => projectIdChanged(event)}
      ></VSCodeTextField>
      <Spacer size="xxlarge" />
      {runningEmulatorInfo ? (
        <>
          Running Emulators:
          <FormatEmulatorRunningInfo infos={runningEmulatorInfo.displayInfo} />
          <Spacer size="xxlarge" />
          <AuthUserMockForm
            disabled={
              // No auth emulator enabled, so we disable the dropdown
              runningEmulatorInfo?.displayInfo?.every(
                (e) => e.name !== Emulators.AUTH,
              ) ?? true
            }
          />
          {!!runningEmulatorInfo.uiUrl && (
            <>
              <Spacer size="xxlarge" />
              <VSCodeLink href={runningEmulatorInfo.uiUrl}>
                View them in the Emulator Suite UI
              </VSCodeLink>
            </>
          )}
          <Spacer size="xxlarge" />
          <VSCodeButton onClick={() => stopEmulators()}>
            Click to stop the emulators
          </VSCodeButton>
        </>
      ) : (
        <VSCodeButton
          onClick={() => launchEmulators()}
          disabled={showEmulatorProgressIndicator}
        >
          Launch FireMAT emulator
        </VSCodeButton>
      )}
    </PanelSection>
  );
}

type MockAuthRole = "admin" | "unauthenticated" | "authenticated";

function AuthUserMockForm(props: { disabled: boolean }) {
  const disabled = props.disabled ?? false;
  const [selectedKind, setSelectedMockKind] = useState<MockAuthRole>("admin");
  const [claims, setClaims] = useState<String>(
    `{\n  "email_verified": true,\n  "sub": "exampleUserId"\n}`,
  );

  useEffect(() => {
    if (disabled) {
      return;
    }

    broker.send("notifyAuthUserMockChange", {
      kind: selectedKind,
      claims: selectedKind === "authenticated" ? claims : undefined,
    });
  }, [disabled, selectedKind, claims]);

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
        disabled={disabled}
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

// Make it pretty for the screen. Filter out the logging emulator since it's
// an implementation detail.
// TODO(christhompson): Add more info and sort this.
function FormatEmulatorRunningInfo({ infos }: { infos: EmulatorInfo[] }) {
  return (
    <ul>
      {infos
        .filter((info) => info.name !== "logging")
        .map((info) => (
          <li key={info.pid}>{info.name}</li>
        ))}
    </ul>
  );
}

/**
 * Formats a project ID with a demo prefix if we're in offline mode, or uses the
 * regular ID if we're in hosting only mode.
 */
function getProjectIdForMode(
  projectId: string | undefined,
  mode: "all" | "hosting" | "firemat",
): string {
  if (!projectId) {
    return "demo-something";
  }
  if (mode === "hosting") {
    return projectId;
  }
  return "demo-" + projectId;
}
