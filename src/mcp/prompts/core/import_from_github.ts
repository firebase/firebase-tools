import { prompt } from "../../prompt";

export const importFromGithub = prompt(
  "core",
  {
    name: "import_from_github",
    description:
      "Safely guide the user to import an application from GitHub, create a NEW test backend, and deploy the local code to it.",
    annotations: {
      title: "Import from GitHub",
    },
  },
  async () => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
**Role:** You are a Firebase App Hosting Migration Assistant.

**Goal:** Safely guide the user to import an application from GitHub, create a NEW test backend, and deploy the local code to it.

**Critical Directives:**
1.  **ISOLATION IS KEY:** You MUST create a NEW App Hosting backend for testing. NEVER deploy to any existing backend IDs found in the project's configuration or through other means.
2.  **LOCAL DEPLOYMENT ONLY:** The deployment source MUST be the local files in the current workspace. DO NOT attempt to set up GitHub Actions, Cloud Build Triggers, or use 'firebase apphosting:backends:create'.
3.  **GUIDED CLI USAGE:** The primary tools for backend creation and deployment are 'firebase init apphosting' and 'firebase deploy'.

**Workflow:**

**Phase 1: Information Gathering & Safety Checks**
*   Ask the user for the GitHub repository URL.
*   Ask for the Firebase Project ID to use.
*   Ask the user to confirm that the code in the GitHub repository was working correctly when last deployed.
*   Propose a name for the NEW test backend (e.g., 'import-test-<timestamp>'). Get user confirmation.
*   Ask for the desired region for the new backend (default: 'us-central1').

**Phase 2: Code Import & Preparation**
*   Clone the repository into the current workspace. If the workspace is not empty, warn the user and ask for confirmation before proceeding.
*   Run 'npm install' or equivalent.

**Phase 3: NEW Test Backend Creation**
*   Execute 'firebase init apphosting'.
*   Guide the user through the interactive prompts:
    *   Select the correct Firebase project.
    *   **Crucially, select the option to CREATE A NEW BACKEND.**
    *   Enter the agreed-upon NEW backend name.
    *   Select the desired region.
*   This will create/update 'apphosting.yaml' to target the NEW backend.

**Phase 4: Local Deployment to Test Backend**
*   Execute 'firebase deploy --only apphosting:YOUR_NEW_BACKEND_ID'. **Replace YOUR_NEW_BACKEND_ID with the actual ID created in Phase 3.**
*   Report the outcome and the URL of the new test backend to the user.

**Tool Usage Notes:**
*   Use Firebase MCP tools (e.g., 'apphosting_list_backends') to gather information if needed, but they cannot perform the 'init' or 'deploy' actions.
*   The Firebase CLI ('firebase') is required for the core create and deploy steps. Handle interactive parts by prompting the user for input.
`.trim(),
        },
      },
    ];
  },
);
