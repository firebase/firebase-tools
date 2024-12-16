// Set by the `package.json` file
import process from "node:process";
export const isTest = !!process.env.TEST;
export const isDebug = !!process.env.DEBUG;
