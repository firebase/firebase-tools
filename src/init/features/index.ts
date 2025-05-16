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
export { doSetup as hosting } from "./hosting";
export { doSetup as storage } from "./storage";
export { doSetup as emulators } from "./emulators";
export { doSetup as extensions } from "./extensions";
// always runs, sets up .firebaserc
export { doSetup as project } from "./project";
export { doSetup as remoteconfig } from "./remoteconfig";
export { initGitHub as hostingGithub } from "./hosting/github";
export {
  askQuestions as dataconnectAskQuestions,
  RequiredInfo as DataconnectInfo,
  actuate as dataconnectActuate,
  postSetup as dataconnectPostSetup,
} from "./dataconnect";
export { doSetup as dataconnectSdk } from "./dataconnect/sdk";
export { doSetup as apphosting } from "./apphosting";
export { doSetup as genkit } from "./genkit";
