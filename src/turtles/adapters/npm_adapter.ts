import { PlatformAdapter } from "../interfaces";

export const NpmAdapter: PlatformAdapter = {
  id: "npm",
  create: {},
  discover: {
    required_files: ["package.json"],
  },
};
