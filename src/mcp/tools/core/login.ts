import { z } from "zod";
import { tool } from "../../tool";
import { loginPrototyper } from "../../../auth";
import { FirebaseMcpServer } from "../../../mcp";
import { toContent, mcpError } from "../../util";
import { User, UserCredentials } from "../../../types/auth";
const LoginInputSchema = z.object({
  authCode: z.string().optional().describe("The authorization code from the login flow"),
});

export type ServerWithLoginState = FirebaseMcpServer & {
  authorize?: (authCode: string) => Promise<UserCredentials>;
};
export const login = tool(
  {
    name: "login",
    description: "Use this to sign the user into the Firebase CLI and Firebase MCP server. This requires a Google Account, and sign in is required to create and work with Firebase Projects.",
    inputSchema: LoginInputSchema,
    _meta: {
      requiresAuth: false,
    },
  },
  async (input: z.infer<typeof LoginInputSchema>, ctx: { host: FirebaseMcpServer }) => {
    const { authCode } = input;

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
      const prototyper = await loginPrototyper();
      serverWithState.authorize = prototyper.authorize;
      const result = {
        uri: prototyper.uri,
        sessionId: prototyper.sessionId,
      };
      const humanReadable = `Please visit this URL to login: ${result.uri}\nYour session ID is: ${result.sessionId}\nInstruct the use to copy the authorization code from that link, and paste it into chat.\nThen, run this tool again with that as the authCode argument to complete the login.`;
      return toContent(humanReadable);
    }
  },
);
