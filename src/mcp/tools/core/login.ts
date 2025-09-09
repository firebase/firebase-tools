import { z } from "zod";
import { tool } from "../../tool";
import { loginPrototyper } from "../../../auth";
import { FirebaseMcpServer } from "../../../mcp";
import { toContent, mcpError } from "../../util";

const LoginInputSchema = z.object({
  authCode: z.string().optional().describe("The authorization code from the login flow"),
});

export const login = tool(
  {
    name: "login",
    description: "Logs the user into Firebase.",
    inputSchema: LoginInputSchema,
    _meta: {
      requiresAuth: false,
    },
  },
  async (input: z.infer<typeof LoginInputSchema>, ctx: { host: FirebaseMcpServer }) => {
    const { authCode } = input;
    const serverWithState = ctx.host as any;

    if (authCode) {
      if (!serverWithState.__login_authorize) {
        return mcpError(
          "Login flow not started. Please call this tool without the authCode argument first to get a login URI.",
        );
      }

      try {
        const creds = await serverWithState.__login_authorize(authCode);
        delete serverWithState.__login_authorize;
        return toContent(`Successfully logged in as ${creds.user.email}`);
      } catch (e: any) {
        delete serverWithState.__login_authorize;
        return mcpError(`Login failed: ${e.message}`);
      }
    } else {
      const prototyper = await loginPrototyper();
      serverWithState.__login_authorize = prototyper.authorize;
      const result = {
        uri: prototyper.uri,
        sessionId: prototyper.sessionId,
      };
      const humanReadable = `Please visit this URL to login: ${result.uri}\nYour session ID is: ${result.sessionId}\nAfter you have the authorization code, call this tool again with the 'authCode' argument.`;
      return toContent(humanReadable);
    }
  },
);
