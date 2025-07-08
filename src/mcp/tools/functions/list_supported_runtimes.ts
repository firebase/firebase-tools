import { z } from "zod";
import { tool } from "../../tool.js";
import { toContent } from "../../util.js";
import { RUNTIMES, Runtime } from "../../../deploy/functions/runtimes/supported";

const SUPPORTED_RUNTIMES = (Object.keys(RUNTIMES) as Runtime[]).filter(
  (r) => RUNTIMES[r].status !== "decommissioned",
);

export const list_supported_runtimes = tool(
  {
    name: "list_supported_runtimes",
    description:
      "Returns a list of all the runtimes currently supported by Cloud Functions, separated by 1st and 2nd generation.",
    inputSchema: z.object({}),
    annotations: {
      title: "List Supported Cloud Functions Runtimes",
      readOnlyHint: true,
    },
    _meta: {
      requiresAuth: false,
      requiresProject: false,
    },
  },
  async () => {
    return toContent({ supportedRuntimes: SUPPORTED_RUNTIMES });
  },
);
