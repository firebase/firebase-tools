export { doSetup as account } from "./account";
export {
  askQuestions as databaseAskQuestions,
  RequiredInfo as DatabaseInfo,
  actuate as databaseActuate,
} from "./database";
export {
  askQuestions as firestoreAskQuestions,
  RequiredInfo as FirestoreInfo,
  actuate as firestoreActuate,
} from "./firestore";
export { doSetup as functions } from "./functions";
export {
  askQuestions as hostingAskQuestions,
  actuate as hostingActuate,
  RequiredInfo as HostingInfo,
} from "./hosting";
export {
  askQuestions as storageAskQuestions,
  RequiredInfo as StorageInfo,
  actuate as storageActuate,
} from "./storage";
export { doSetup as emulators } from "./emulators";
export { doSetup as extensions } from "./extensions";
// always runs, sets up .firebaserc
export { doSetup as project } from "./project";
export { doSetup as remoteconfig } from "./remoteconfig";
export { initGitHub as hostingGithub } from "./hosting/github";
export {
  askQuestions as dataconnectAskQuestions,
  RequiredInfo as DataconnectInfo,
  Source as DataconnectSource,
  actuate as dataconnectActuate,
} from "./dataconnect";
export {
  askQuestions as dataconnectSdkAskQuestions,
  SdkRequiredInfo as DataconnectSdkInfo,
  actuate as dataconnectSdkActuate,
} from "./dataconnect/sdk";
export {
  askQuestions as dataconnectResolverAskQuestions,
  ResolverRequiredInfo as DataconnectResolverInfo,
  actuate as dataconnectResolverActuate,
} from "./dataconnect/resolver";
export { doSetup as apphosting } from "./apphosting";
export { doSetup as genkit } from "./genkit";
export {
  askQuestions as apptestingAskQuestions,
  RequiredInfo as ApptestingInfo,
  actuate as apptestingAcutate,
} from "./apptesting";
export { doSetup as aitools } from "./aitools";
export {
  askQuestions as aiLogicAskQuestions,
  AiLogicInfo,
  actuate as aiLogicActuate,
} from "./ailogic";
export { askQuestions as authAskQuestions, actuate as authActuate, AuthInfo } from "./auth";
