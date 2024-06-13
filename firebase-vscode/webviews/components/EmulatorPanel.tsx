// DISABLED UNTIL MULTIPLE EMULATORS IS SUPPORTED

// import { VSCodeButton, VSCodeLink } from "@vscode/webview-ui-toolkit/react";
// import React, { useEffect } from "react";
// import { Spacer } from "./ui/Spacer";
// import { broker, useBroker, useBrokerListener } from "../globals/html-broker";
// import { PanelSection } from "./ui/PanelSection";
// import { FirebaseConfig } from "../../../src/firebaseConfig";
// import { EmulatorInfo } from "../../../src/emulator/types";
// import { webLogger } from "../globals/web-logger";
// import { DEFAULT_EMULATOR_UI_SELECTIONS } from "../../common/messaging/protocol";

// /**
//  * Emulator panel component for the VSCode extension. Handles start/stop,  import/export.
//  */
// export function EmulatorPanel({
//   firebaseJson,
// }: {
//   firebaseJson: FirebaseConfig;
//   projectId?: string | undefined;
// }) {
//   if (!firebaseJson) {
//     throw Error("Expected a valid FirebaseConfig.");
//   }
//   const emulatorUiSelections =
//     useBroker("notifyEmulatorUiSelectionsChanged", {
//       initialRequest: "getEmulatorUiSelections",
//     }) ?? DEFAULT_EMULATOR_UI_SELECTIONS;

//   useEffect(() => {
//     if (emulatorUiSelections) {
//       webLogger.debug(
//         `Emulator UI selections: ${JSON.stringify(emulatorUiSelections)}`
//       );
//     }
//   }, [emulatorUiSelections]);

//   const emulators = useBroker("notifyEmulatorStateChanged", {
//     initialRequest: "getEmulatorInfos",
//   }) ?? { status: "stopped", infos: undefined };
//   const runningEmulatorInfo = emulators.infos;

//   const showEmulatorProgressIndicator =
//     emulators.status === "starting" || emulators.status === "stopping";

//   useBrokerListener("notifyEmulatorImportFolder", ({ folder }) => {
//     webLogger.debug(
//       `notifyEmulatorImportFolder received in sidebar: ${folder}`
//     );
//     const newSelections = {
//       ...emulatorUiSelections,
//       importStateFolderPath: folder,
//     };
//     broker.send("updateEmulatorUiSelections", newSelections);
//   });

//   function launchEmulators() {
//     if (!emulatorUiSelections.projectId) {
//       broker.send("showMessage", {
//         msg: "Missing project ID",
//         options: {
//           modal: true,
//           detail: `Please specify a project ID before starting the emulator suite.`,
//         },
//       });
//       return;
//     }
//     if (!firebaseJson) {
//       // TODO(christhompson): Consider using a default config in the case that
//       // firebase.json doesn't exist.
//       broker.send("showMessage", {
//         msg: "Missing firebase.json",
//         options: {
//           modal: true,
//           detail: `Unable to find firebase.json file.`,
//         },
//       });
//       return;
//     }
//     broker.send("launchEmulators");
//   }

//   return (
//     <PanelSection
//       title="Emulators"
//       style={{
//         // Align with the other panels.
//         marginLeft: "calc(var(--container-padding) * -1)",
//       }}
//     >
//       {/* TODO(christhompson): Insert some education links or tooltips here. */}
//       <Spacer size="xxlarge" />
//       <span>
//         {"Current project ID: "}
//         {/* TODO(christhompson): convert this into a demo- prefix checkbox or something. */}
//         <b>{emulatorUiSelections.projectId}</b>
//       </span>
//       <Spacer size="xxlarge" />
//       {runningEmulatorInfo ? (
//         <>
//           Running Emulators:
//           <FormatEmulatorRunningInfo infos={runningEmulatorInfo.displayInfo} />
//           <Spacer size="xxlarge" />
//           {!!runningEmulatorInfo.uiUrl && (
//             <>
//               <Spacer size="xxlarge" />
//               <VSCodeLink href={runningEmulatorInfo.uiUrl}>
//                 View them in the Emulator Suite UI
//               </VSCodeLink>
//             </>
//           )}
//           <Spacer size="xxlarge" />
//           <VSCodeButton onClick={() => broker.send("stopEmulators")}>
//             Click to stop the emulators
//           </VSCodeButton>
//         </>
//       ) : (
//         <VSCodeButton
//           onClick={() => launchEmulators()}
//           disabled={showEmulatorProgressIndicator}
//         >
//           Launch Data Connect emulator
//         </VSCodeButton>
//       )}
//     </PanelSection>
//   );
// }

// // Make it pretty for the screen. Filter out the logging emulator since it's
// // an implementation detail.
// // TODO(christhompson): Add more info and sort this.
// function FormatEmulatorRunningInfo({ infos }: { infos: EmulatorInfo[] }) {
//   return (
//     <ul>
//       {infos
//         .filter((info) => info.name !== "logging")
//         .map((info, index) => (
//           <li key={info.pid ?? index}>{info.name}</li>
//         ))}
//     </ul>
//   );
// }
