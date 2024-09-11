import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import React, { useEffect } from "react";
import { Spacer } from "./ui/Spacer";
import { PanelSection } from "./ui/PanelSection";
import { EmulatorInfo } from "../../../src/emulator/types";
import { RunningEmulatorInfo } from "../messaging/types";

/**
 * Emulator info display component for the VSCode extension. 
 */
export function EmulatorPanel({
    emulatorInfo,
}: {
    emulatorInfo: RunningEmulatorInfo,
}) {
  return (
    <PanelSection
      title="Emulators"
      style={{
        // Align with the other panels.
        marginLeft: "calc(var(--container-padding) * -1)",
      }}
    >
      <Spacer size="xxlarge" />
          Running Emulators:
          <FormatEmulatorRunningInfo infos={emulatorInfo.displayInfo} />
          <Spacer size="xxlarge" />
          {!!emulatorInfo.uiUrl && (
            <>
              <Spacer size="xxlarge" />
              <VSCodeLink href={emulatorInfo.uiUrl}>
                View them in the Emulator Suite UI
              </VSCodeLink>
            </>
          )}
          </PanelSection>
  )}

// Make it pretty for the screen. Filter out the logging emulator since it's
// an implementation detail.
function FormatEmulatorRunningInfo({ infos }: { infos: EmulatorInfo[] }) {
  return (
    <ul>
      {infos
        .filter((info) => info.name !== "logging")
        .map((info, index) => (
          <li key={info.pid ?? index}>{info.name}</li>
        ))}
    </ul>
  );
}