import { PlatformAdapter } from "../interfaces";

export const NpmAdapter: PlatformAdapter = {
  id: "npm",
  create: {},
  discovery: {
    required_files: ["package.json"],
  },
};
