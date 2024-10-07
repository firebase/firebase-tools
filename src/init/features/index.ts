export { doSetup as account } from "./account";
export { doSetup as database } from "./database";
export { doSetup as firestore } from "./firestore";
export { doSetup as functions } from "./functions";
export { doSetup as hosting } from "./hosting";
export { doSetup as storage } from "./storage";
export { doSetup as emulators } from "./emulators";
export { doSetup as extensions } from "./extensions";
// always runs, sets up .firebaserc
export { doSetup as project } from "./project";
export { doSetup as remoteconfig } from "./remoteconfig";
export { initGitHub as hostingGithub } from "./hosting/github";
export { doSetup as dataconnect } from "./dataconnect";
export { doSetup as dataconnectSdk } from "./dataconnect/sdk";
export { doSetup as apphosting } from "./apphosting";
export { doSetup as genkit } from "./genkit";
