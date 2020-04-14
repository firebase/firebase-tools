import { URL } from "url";
import * as express from "express";
import { resetPassword, setAccountInfoImpl } from "./operations";
import { ProjectState } from "./state";
import { BadRequestError, NotImplementedError } from "./errors";

/**
 * Register routes for emulator-only handlers.
 * @param app the main express app
 * @param getProjectStateByApiKey function for resolving project by API key
 */
export function registerHandlers(
  app: express.Express,
  getProjectStateByApiKey: (apiKey: string) => ProjectState
): void {
  app.get(`/emulator/action`, (req, res) => {
    const { mode, oobCode, continueUrl, apiKey } = req.query as Record<string, string | undefined>;

    if (!apiKey) {
      return res.status(400).json({
        authEmulator: {
          error: "missing apiKey query parameter",
          instructions: `Please modify the URL to specify an apiKey, such as ...&apiKey=YOUR_API_KEY`,
        },
      });
    }
    if (!oobCode) {
      return res.status(400).json({
        authEmulator: {
          error: "missing oobCode query parameter",
          instructions: `Please modify the URL to specify an oobCode, such as ...&oobCode=YOUR_OOB_CODE`,
        },
      });
    }
    const state = getProjectStateByApiKey(apiKey);

    switch (mode) {
      case "resetPassword": {
        const oob = state.validateOobCode(oobCode);
        if (oob?.requestType !== "PASSWORD_RESET") {
          return res.status(400).json({
            authEmulator: {
              error: `Your request to reset your password has expired or the link has already been used.`,
              instructions: `Try resetting your password again.`,
            },
          });
        }
        if (!req.query.newPassword) {
          return res.status(400).json({
            authEmulator: {
              error: "missing newPassword query parameter",
              instructions: `To reset the password for ${oob.email}, send an HTTP GET request to the following URL.`,
              instructions2: "You may use a web browser or any HTTP client, such as curl.",
              urlTemplate: `${oob.oobLink}&newPassword=NEW_PASSWORD_HERE`,
            },
          });
        } else if (req.query.newPassword === "NEW_PASSWORD_HERE") {
          return res.status(400).json({
            authEmulator: {
              error: "newPassword must be something other than 'NEW_PASSWORD_HERE'",
              instructions: "The string 'NEW_PASSWORD_HERE' is just a placeholder.",
              instructions2: "Please change the URL to specify a new password instead.",
              urlTemplate: `${oob.oobLink}&newPassword=NEW_PASSWORD_HERE`,
            },
          });
        }
        const { email } = resetPassword(state, {
          oobCode,
          newPassword: req.query.newPassword as string,
        });

        if (continueUrl) {
          return res.redirect(303, continueUrl);
        } else {
          return res.status(200).json({
            authEmulator: { success: `The password has been successfully updated.`, email },
          });
        }
      }
      case "verifyEmail": {
        try {
          const { email } = setAccountInfoImpl(state, { oobCode });
          if (continueUrl) {
            return res.redirect(303, continueUrl);
          } else {
            return res.status(200).json({
              authEmulator: { success: `The email has been successfully verified.`, email },
            });
          }
        } catch (e) {
          if (
            e instanceof NotImplementedError ||
            (e instanceof BadRequestError && e.message === "INVALID_OOB_CODE")
          ) {
            return res.status(400).json({
              authEmulator: {
                error: `Your request to verify your email has expired or the link has already been used.`,
                instructions: `Try verifying your email again.`,
              },
            });
          } else {
            throw e;
          }
        }
      }
      case "signIn": {
        if (!continueUrl) {
          return res.status(400).json({
            authEmulator: {
              error: "Missing continueUrl query parameter",
              instructions: `To sign in, append &continueUrl=YOUR_APP_URL to the link.`,
            },
          });
        }
        const redirectTo = new URL(continueUrl);
        for (const name of Object.keys(req.query)) {
          if (name !== "continueUrl") {
            const query = req.query[name];
            if (typeof query === "string") {
              redirectTo.searchParams.set(name, query);
            }
          }
        }
        return res.redirect(303, redirectTo.toString());
      }
      default:
        return res.status(400).json({ authEmulator: { error: "Invalid mode" } });
    }
  });

  app.get(`/emulator/auth/handler`, (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<!DOCTYPE html>
<meta charset="utf-8">
<title>Not Implemented</title>
<h1>Not Implemented in Auth Emulator</h1>
<p>
  Sign-in with popup / redirect / web-views with the Auth Emulator
  is not yet supported.
</p>
<p>We're working on it. Please stay tuned.</p>
<p>In the meantime, try <code>signInWithCredential</code> instead.</p>
`
    );
  });

  app.get(`/emulator/auth/iframe`, (req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<!DOCTYPE html>
<meta charset="utf-8">
<title>Auth Emulator: iframe stub</title>
<p>This page does not do anything yet.</p>
`
    );
  });
}
