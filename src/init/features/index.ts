export { doSetup as account } from "./account.js";
export { doSetup as database } from "./database.js";
export { doSetup as firestore } from "./firestore/index.js";
export { doSetup as functions } from "./functions/index.js";
export { doSetup as hosting } from "./hosting/index.js";
export { doSetup as storage } from "./storage.js";
export { doSetup as emulators } from "./emulators.js";
export { doSetup as extensions } from "./extensions/index.js";
// always runs, sets up .firebaserc
export { doSetup as project } from "./project.js";
export { doSetup as remoteconfig } from "./remoteconfig.js";
export { initGitHub as hostingGithub } from "./hosting/github.js";
export { doSetup as dataconnect } from "./dataconnect/index.js";
export { doSetup as dataconnectSdk } from "./dataconnect/sdk.js";
export { doSetup as apphosting } from "./apphosting.js";
export { doSetup as genkit } from "./genkit/index.js";
