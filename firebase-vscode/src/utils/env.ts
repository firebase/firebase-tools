// Set by the `package.json` file
export const isTest = !!process.env.TEST;
export const isDebug = !!process.env.DEBUG;

export const FIREBASE_PROJECT = process.env.FBTOOLS_TARGET_PROJECT || "";
