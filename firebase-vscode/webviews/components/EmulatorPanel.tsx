import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import React from "react";
import { Spacer } from "./ui/Spacer";
import { EmulatorInfo, Emulators, IMPORT_EXPORT_EMULATORS } from "../../../src/emulator/types";
import { RunningEmulatorInfo } from "../messaging/types";
import { Body, Label } from "./ui/Text";
import { broker } from "../globals/html-broker";
import styles from "./EmulatorPanel.scss";
import { ExternalLink } from "./ui/ExternalLink";
import { Icon } from "./ui/Icon";

/**
 * Emulator info display component for the VSCode extension.
 */
export function EmulatorPanel({
  emulatorInfo,
}: {
  emulatorInfo: RunningEmulatorInfo;
}) {
  return (
    <>
      <Label level={2}>Emulators running</Label>
      <Spacer size="medium" />
      <FormatEmulatorRunningInfo infos={emulatorInfo.displayInfo} />

      {!!emulatorInfo.uiUrl && (
        <>
          <Spacer size="xxlarge" />
          <VSCodeLink href={emulatorInfo.uiUrl}>
            View them in the Emulator Suite UI
          </VSCodeLink>
        </>
      )}
      <RunningEmulatorControlButtons infos={emulatorInfo.displayInfo}></RunningEmulatorControlButtons>
      <Spacer size="large" />
      <Body>
        <ExternalLink
          href="https://firebase.google.com/docs/emulator-suite"
          prefix={<Icon icon="book" />}
        >
          View emulator docs
        </ExternalLink>
      </Body>
    </>
  );
}

// Make it pretty for the screen. Filter out the logging emulator since it's
// an implementation detail.
function FormatEmulatorRunningInfo({ infos }: { infos: EmulatorInfo[] }) {
  return (
    <ul className={styles.list}>
      {infos
        .filter((info) => info.name !== "logging")
        .map((info, index) => (
          <li key={info.pid ?? index} className={styles.listItem}>
            <Icon icon="circle-filled" className={styles.runningIndicator} />
            <Body as="span">
              {info.name}
              <Label as="span" level={3}>
                &nbsp;:{info.port}
              </Label>
            </Body>
          </li>
        ))}
    </ul>
  );
}

function RunningEmulatorControlButtons({ infos }: { infos: EmulatorInfo[] }) {
  return (
    <Body>
      {!!infos.some(e => e.name === Emulators.DATACONNECT) && (
        <VSCodeButton onClick={() => broker.send("fdc.clear-emulator-data")}>
          Clear Data Connect Data
        </VSCodeButton>
      )}
      {!!infos.some(e => IMPORT_EXPORT_EMULATORS.includes(e.name)) && (
        <VSCodeButton onClick={() => broker.send("runEmulatorsExport")}>
          Export Emulator Data
        </VSCodeButton>
      )}
    </Body>
  );
}
