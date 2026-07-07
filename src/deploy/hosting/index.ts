export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help =
  "Deploys assets, redirects, rewrites, and headers configuration from your project's firebase.json.";
export const detailedHelp =
  "Firebase Hosting deploys web assets, redirects, rewrites, and header configurations.\n\n" +
  "Configuration format in firebase.json:\n" +
  "{\n" +
  '  "hosting": {\n' +
  '    "public": "public",\n' +
  '    "ignore": [\n' +
  '      "firebase.json",\n' +
  '      "**/.*",\n' +
  '      "**/node_modules/**"\n' +
  "    ],\n" +
  '    "rewrites": [\n' +
  '      { "source": "**", "destination": "/index.html" }\n' +
  "    ]\n" +
  "  }\n" +
  "}";
