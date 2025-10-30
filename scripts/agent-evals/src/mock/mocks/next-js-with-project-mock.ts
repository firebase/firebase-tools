import {
  DEFAULT_FIREBASE_PROJECT,
  DEFAULT_FIREBASE_PROJECT_NAME,
  DEFAULT_FIREBASE_PROJECT_NUMBER,
  DEFAULT_FIREBASE_USER,
  DEFAULT_FIREBASE_WEB_APP_ID,
  DEFAULT_FIREBASE_WEB_APP_NAME,
  DEFAULT_FIREBASE_WEB_APP_API_KEY,
} from "../../data/index.js";
import { toMockContent } from "../tool-mock-utils.js";

export const nextJsWithProjectMock = {
  firebase_login: toMockContent(`Successfully logged in as ${DEFAULT_FIREBASE_USER}`),

  firebase_get_environment: toMockContent(`# Environment Information

Project Directory:
/Users/samedson/Firebase/firebase-tools/scripts/agent-evals/output/2025-10-24_15-36-06-588Z/-firebase-init-backend-app-2c27e75e3e5d809c/repo
Project Config Path: <NO CONFIG PRESENT>
Active Project ID: ${DEFAULT_FIREBASE_PROJECT}
Gemini in Firebase Terms of Service: Accepted
Authenticated User: ${DEFAULT_FIREBASE_USER}
Detected App IDs: <NONE>
Available Project Aliases (format: '[alias]: [projectId]'): <NONE>

No firebase.json file was found.

If this project does not use Firebase services that require a firebase.json file, no action is necessary.

If this project uses Firebase services that require a firebase.json file, the user will most likely want to:

a) Change the project directory using the 'firebase_update_environment' tool to select a directory with a 'firebase.json' file in it, or
b) Initialize a new Firebase project directory using the 'firebase_init' tool.

Confirm with the user before taking action.`),

  firebase_update_environment: toMockContent(
    `- Updated active project to '${DEFAULT_FIREBASE_PROJECT}'\n`,
  ),

  firebase_list_projects: toMockContent(`
- projectId: ${DEFAULT_FIREBASE_PROJECT}
  projectNumber: '${DEFAULT_FIREBASE_PROJECT_NUMBER}'
  displayName: ${DEFAULT_FIREBASE_PROJECT_NAME}
  name: projects/${DEFAULT_FIREBASE_PROJECT}
  resources:
    hostingSite: ${DEFAULT_FIREBASE_PROJECT}
  state: ACTIVE
  etag: 1_99999999-7777-4444-8888-dddddddddddd
`),

  firebase_list_apps: toMockContent(`
- name: 'projects/${DEFAULT_FIREBASE_PROJECT}/webApps/${DEFAULT_FIREBASE_WEB_APP_ID}'
  displayName: ${DEFAULT_FIREBASE_WEB_APP_NAME}
  platform: WEB
  appId: '${DEFAULT_FIREBASE_WEB_APP_ID}'
  namespace: 000000000000000000000000000000000000000000000000
  apiKeyId: ${DEFAULT_FIREBASE_WEB_APP_API_KEY}
  state: ACTIVE
  expireTime: '1970-01-01T00:00:00Z'
`),

  firebase_get_sdk_config: toMockContent(
    `{"projectId":"${DEFAULT_FIREBASE_PROJECT}","appId":"${DEFAULT_FIREBASE_WEB_APP_ID}","storageBucket":"${DEFAULT_FIREBASE_PROJECT}.firebasestorage.app","apiKey":"${DEFAULT_FIREBASE_WEB_APP_API_KEY}","authDomain":"${DEFAULT_FIREBASE_PROJECT}.firebaseapp.com","messagingSenderId":"${DEFAULT_FIREBASE_PROJECT_NUMBER}","projectNumber":"${DEFAULT_FIREBASE_PROJECT_NUMBER}","version":"2"}`,
  ),
} as const;
