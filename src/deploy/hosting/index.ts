export { prepare } from "./prepare";
export { deploy } from "./deploy";
export { release } from "./release";

export const help =
  "Deploys static web apps to Firebase Hosting, including assets, redirects, rewrites and headers.";
export const detailedHelp =
  "Firebase Hosting deploys web assets, redirects, rewrites, and header configurations.\n\n" +
  "Single site configuration in firebase.json:\n" +
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
  "}\n\n" +
  "Multiple sites configuration (by site ID or deploy target):\n" +
  "{\n" +
  '  "hosting": [\n' +
  "    {\n" +
  '      "site": "my-site-id",\n' +
  '      "public": "dist"\n' +
  "    },\n" +
  "    {\n" +
  '      "target": "my-site-target",\n' +
  '      "public": "build"\n' +
  "    }\n" +
  "  ]\n" +
  "}";
