import {
  VSCodeButton,
  VSCodeCheckbox,
  VSCodeDivider,
  VSCodeLink,
  VSCodeProgressRing,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Spacer } from "./ui/Spacer";
import { broker } from "../globals/html-broker";
import { PanelSection } from "./ui/PanelSection";
import { FirebaseConfig } from "../../../src/firebaseConfig";
import {
  RunningEmulatorInfo,
  EmulatorUiSelections,
} from "../../common/messaging/types";
import { VSCodeDropdown } from "@vscode/webview-ui-toolkit/react";
import { VSCodeOption } from "@vscode/webview-ui-toolkit/react";
import { EmulatorInfo } from "../../../src/emulator/types";
import { webLogger } from "../globals/web-logger";

const DEFAULT_EMULATOR_UI_SELECTIONS: EmulatorUiSelections = {
  projectId: "demo-something",
  importStateFolderPath: "",
  exportStateOnExit: false,
  mode: "all",
  debugLogging: false,
};

export interface EmulatorsController {
  readonly status: "stopped" | "starting" | "stopping" | "running";
  readonly emulators?: RunningEmulatorInfo;

  launchEmulators(
    selection: EmulatorUiSelections,
    firebaseConfig: FirebaseConfig
  ): void;

  stopEmulators(): void;
}

const emulatorContext = React.createContext<EmulatorsController | undefined>(
  undefined
);

export function useEmulator(): EmulatorsController {
  return React.useContext(emulatorContext)!;
}

export function EmulatorProvider(props: React.PropsWithChildren<{}>) {
  // TODO(christhompson): Load UI selections from the current workspace.
  // Requires context object.
  // TODO(christhompson): Check if the emulators are running on extension start.
  const [emulators, setEmulators] =
    useState<EmulatorsController["emulators"]>();

  const [status, setStatus] =
    useState<EmulatorsController["status"]>("stopped");

  useEffect(() => {
    return broker.on("notifyEmulatorsStopped", () => {
      setStatus("stopped");
      webLogger.debug(`notifyEmulatorsStopped received in webview`);
      setEmulators(null);
    });
  }, []);

  useEffect(() => {
    return broker.on("notifyEmulatorStartFailed", () => {
      setStatus("stopped");
      webLogger.debug(`notifyEmulatorStartFailed received in webview`);
    });
  }, []);

  useEffect(() => {
    return broker.on(
      "notifyRunningEmulatorInfo",
      (info: RunningEmulatorInfo) => {
        setStatus("running");
        webLogger.debug(`notifyRunningEmulatorInfo received in webview`);
        setEmulators(info);
      }
    );
  }, []);

  const controller: EmulatorsController = useMemo(
    () => ({
      status,
      emulators,
      launchEmulators(emulatorUiSelections, firebaseConfig) {
        if (
          !emulatorUiSelections ||
          !firebaseConfig ||
          !emulatorUiSelections.projectId
        ) {
          throw Error(
            "Expected valid EmulatorUiSelections and FirebaseConfig."
          );
        }

        setStatus("starting");
        broker.send("launchEmulators", { emulatorUiSelections });
      },
      stopEmulators() {
        setStatus("stopping");
        broker.send("stopEmulators");
      },
    }),
    [status, emulators]
  );

  return (
    <emulatorContext.Provider value={controller}>
      {props.children}
    </emulatorContext.Provider>
  );
}

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

  webLogger.debug(
    "initial state ui selections:" + JSON.stringify(emulatorUiSelections)
  );
  function setEmulatorUiSelectionsAndSaveToWorkspace(
    uiSelections: EmulatorUiSelections
  ) {
    // TODO(christhompson): Save UI selections in the current workspace.
    // Requires context object.
    setEmulatorUiSelections(uiSelections);
  }

  const emulatorController = useEmulator();

  const showEmulatorProgressIndicator =
    emulatorController.status === "starting" ||
    emulatorController.status === "stopping";

  broker.on("notifyEmulatorImportFolder", ({ folder }) => {
    webLogger.debug(
      `notifyEmulatorImportFolder received in sidebar: ${folder}`
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
      // firebase.json doesnt exist.
      broker.send("showMessage", {
        msg: "Missing firebase.json",
        options: {
          modal: true,
          detail: `Unable to find firebase.json file.`,
        },
      });
      return;
    }

    emulatorController.launchEmulators(emulatorUiSelections, firebaseJson);
  }

  useEffect(() => broker.on("startEmulators", launchEmulators), []);

  /**
   * Called when import folder changes.
   */
  function selectedImportFolder(event: any) {
    event.preventDefault();
    broker.send("selectEmulatorImportFolder");
  }

  function toggleExportOnExit() {
    const selections: EmulatorUiSelections = emulatorUiSelections;
    selections.exportStateOnExit = !selections.exportStateOnExit;
    webLogger.debug(`toggle export on exit : ${!selections.exportStateOnExit}`);
    setEmulatorUiSelectionsAndSaveToWorkspace(selections);
  }

  function emulatorModeChanged(event: React.ChangeEvent<HTMLSelectElement>) {
    webLogger.debug("emulatorModeChanged: " + event.target.value);
    const newSelections: EmulatorUiSelections = { ...emulatorUiSelections };
    newSelections.mode = event.target.value as typeof emulatorUiSelections.mode;
    newSelections.projectId = getProjectIdForMode(
      projectId,
      newSelections.mode
    );
    setEmulatorUiSelectionsAndSaveToWorkspace(newSelections);
  }

  function clearImportFolder() {
    console.log(`clearImportFolder`);
    const newSelections = {
      ...emulatorUiSelections,
      importStateFolderPath: "",
    };
    setEmulatorUiSelectionsAndSaveToWorkspace(newSelections);
  }

  // Make it pretty for the screen. Filter out the logging emulator since it's
  // an implementation detail.
  // TODO(christhompson): Add more info and sort this.
  function formatEmulatorRunningInfo(emulatorInfos: EmulatorInfo[]): string {
    return emulatorInfos
      .map((info) => info.name)
      .filter((name) => name !== "logging")
      .join("<br/>");
  }

  return (
    <PanelSection title="Emulators">
      <h2>Launch the Emulator Suite</h2>
      {/* TODO(christhompson): Insert some education links or tooltips here. */}
      <Spacer size="xxlarge" />
      <span>
        {"Current project ID: "}
        {/* TODO(christhompson): convert this into a demo- prefix checkbox or something. */}
        <b>{emulatorUiSelections.projectId}</b>
      </span>
      <Spacer size="xxlarge" />
      Import emulator state from directory:
      <VSCodeTextField
        disabled={true}
        value={emulatorUiSelections.importStateFolderPath}
      ></VSCodeTextField>
      <Spacer size="small" />
      <input
        disabled={!!emulatorController.emulators}
        type="file"
        id="import-folder-picker"
        onClick={(event) => selectedImportFolder(event)}
      />
      <Spacer size="small" />
      <VSCodeButton
        disabled={!!emulatorController.emulators}
        appearance="secondary"
        onClick={clearImportFolder}
      >
        Clear
      </VSCodeButton>
      <Spacer size="xxlarge" />
      <VSCodeCheckbox
        disabled={!emulatorUiSelections.importStateFolderPath}
        value={emulatorUiSelections.exportStateOnExit}
        onChange={() => toggleExportOnExit()}
      >
        Export emulator state on exit
      </VSCodeCheckbox>
      <Spacer size="xxlarge" />
      {showEmulatorProgressIndicator ? <VSCodeProgressRing /> : <></>}
      Emulator "mode"
      <VSCodeDropdown
        disabled={!!emulatorController.emulators}
        onChange={(event) => emulatorModeChanged(event)}
      >
        <VSCodeOption value="all">All emulators</VSCodeOption>
        {!!firebaseJson.hosting && (
          <VSCodeOption value="hosting">Only hosting</VSCodeOption>
        )}
      </VSCodeDropdown>
      {emulatorController.emulators ? (
        <>
          <VSCodeDivider />
          <Spacer size="xxlarge" />
          The emulators are running.
          <Spacer size="xxlarge" />
          {!!emulatorController.emulators.uiUrl && (
            <VSCodeLink href={emulatorController.emulators.uiUrl}>
              View them in the Emulator Suite UI
            </VSCodeLink>
          )}
          <Spacer size="xxlarge" />
          Running Emulators:
          <Spacer size="medium" />
          <div
            dangerouslySetInnerHTML={{
              __html: formatEmulatorRunningInfo(
                emulatorController.emulators.displayInfo
              ),
            }}
          ></div>
          <Spacer size="xxlarge" />
          <VSCodeButton onClick={emulatorController.stopEmulators}>
            Click to stop the emulators
          </VSCodeButton>
        </>
      ) : (
        <VSCodeButton
          onClick={() => launchEmulators()}
          disabled={showEmulatorProgressIndicator ? true : false}
        >
          Launch emulators
        </VSCodeButton>
      )}
    </PanelSection>
  );
}

/**
 * Formats a project ID with a demo prefix if we're in offline mode, or uses the
 * regular ID if we're in hosting only mode.
 */
function getProjectIdForMode(
  projectId: string | undefined,
  mode: "all" | "hosting"
): string {
  if (!projectId) {
    return "demo-something";
  }
  if (mode === "hosting") {
    return projectId;
  }
  return "demo-" + projectId;
}
