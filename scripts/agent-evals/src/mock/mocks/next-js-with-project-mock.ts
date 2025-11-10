import {
  DEFAULT_FIREBASE_PROJECT,
  DEFAULT_FIREBASE_PROJECT_NAME,
  DEFAULT_FIREBASE_PROJECT_NUMBER,
  DEFAULT_FIREBASE_USER,
  DEFAULT_FIREBASE_WEB_APP_ID,
  DEFAULT_FIREBASE_WEB_APP_NAME,
  DEFAULT_FIREBASE_WEB_APP_API_KEY,
} from "../../data/index.js";
import { renderTemplate } from "../../../../../src/mcp/tools/core/get_environment.js";
import { toMockContent } from "../tool-mock-utils.js";

const PROJECT_DIR = "/Users/fakeuser/develop/fake-project";
const environmentConfig = {
  projectId: DEFAULT_FIREBASE_PROJECT,
  projectAliases: [],
  projectDir: PROJECT_DIR,
  geminiTosAccepted: true,
  authenticatedUser: DEFAULT_FIREBASE_USER,
  projectAliasMap: {},
  allAccounts: [],
  detectedAppIds: {},
};

export const nextJsWithProjectMock = {
  firebase_login: toMockContent(`Successfully logged in as ${DEFAULT_FIREBASE_USER}`),

  firebase_get_environment: toMockContent(renderTemplate(environmentConfig)),

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
