import { z } from "zod";
import { tool } from "../../tool";
import { loginPrototyper, getProjectDefaultAccount } from "../../../auth";
import { FirebaseMcpServer } from "../../../mcp";
import { toContent, mcpError } from "../../util";
import { User, UserCredentials } from "../../../types/auth";
const LoginInputSchema = z.object({
  authCode: z
    .string()
    .optional()
    .describe(
      "The authorization code generated after the user signs in via the login URL. Leave this field empty on the first call to initiate the login flow.",
    ),
  reauth: z.boolean().optional().describe("Force reauthentication even if already logged in."),
});

export type ServerWithLoginState = FirebaseMcpServer & {
  authorize?: (authCode: string) => Promise<UserCredentials>;
};
export const login = tool(
  "core",
  {
    name: "login",
    description: `Signs the user into the Firebase CLI and Firebase MCP server.
 
**Prerequisites:**
* A Google Account is required.
* Sign in is required to work with Firebase Projects and call most other Firebase tools.

**When to use it:**
* Use this tool when you need to authenticate the Firebase CLI/MCP server.
* Use this tool to check the current login status (which account is currently authenticated).
* Use this tool to switch accounts or force reauthentication when credentials expire or change.

**How to use it:**
* To check current login status, call the tool without any parameters. If a user is already logged in, it will return the logged-in email.
* To log in (initial or after logging out), call the tool without any parameters:
  1. The tool will return a login URL (\`uri\`) and a \`sessionId\`.
  2. **CRITICAL SECURITY REQUIREMENT**: The agent MUST display BOTH the login URL and the Session ID to the user. Explicitly instruct the user to verify that the Session ID shown on the browser matches the Session ID provided by the agent. This prevents phishing attacks.
  3. Once the user signs in on the browser and copies the authorization code, call this tool again with that code passed to the \`authCode\` parameter.
* To force reauthentication or log in as a different account, call the tool with \`reauth: true\`.

**JSON Examples:**

*Scenario 1: Check login status (or initiate login flow if not authenticated)*
\`\`\`json
{}
\`\`\`

*Scenario 2: Complete the login flow with the retrieved authorization code*
\`\`\`json
{
  "authCode": "4/0ATsMZqD..."
}
\`\`\`

*Scenario 3: Force reauthentication*
\`\`\`json
{
  "reauth": true
}
\`\`\`
`,
    inputSchema: LoginInputSchema,
    _meta: {
      requiresAuth: false,
    },
  },
  async (input: z.infer<typeof LoginInputSchema>, ctx: { host: FirebaseMcpServer }) => {
    const { authCode, reauth } = input;

    const serverWithState: ServerWithLoginState = ctx.host;

    if (authCode) {
      if (!serverWithState.authorize) {
        return mcpError(
          "Login flow not started. Please call this tool without the authCode argument first to get a login URI.",
        );
      }

      try {
        const creds = await serverWithState.authorize(authCode);
        delete serverWithState.authorize;
        const user = creds.user as User;
        return toContent(`Successfully logged in as ${user.email}`);
      } catch (e: any) {
        delete serverWithState.authorize;
        return mcpError(`Login failed: ${e.message}`);
      }
    } else {
      const account = getProjectDefaultAccount(ctx.host.cachedProjectDir || ctx.host.startupRoot);
      if (account && !reauth) {
        return toContent(`Already logged in as ${account.user.email}`);
      }

      const prototyper = await loginPrototyper();
      serverWithState.authorize = prototyper.authorize;
      const result = {
        uri: prototyper.uri,
        sessionId: prototyper.sessionId,
      };
      const humanReadable = `Please visit this URL to login: ${result.uri}
Your session ID is: ${result.sessionId}

CRITICAL SECURITY REQUIREMENT:
As the agent, you MUST explicitly display BOTH the login URL and the Session ID to the user in your response.
Instruct the user to verify that the Session ID displayed on the browser matches the Session ID above to prevent phishing attacks before they grant access.

Once the user has completed the login, instruct them to copy the authorization code and paste it back into the chat.
Then, call this tool again with the authorization code passed as the 'authCode' parameter to complete the login.`;
      return toContent(humanReadable);
    }
  },
);
