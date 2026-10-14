import { FrameworkSpec } from "./types";

export const frameworkSpecs: FrameworkSpec[] = [
  {
    id: "express",
    runtime: "nodejs",
    webFrameworkId: "Express.js",
    requiredDependencies: [
      {
        name: "express",
      },
    ],
  },
  {
    id: "nextjs",
    runtime: "nodejs",
    webFrameworkId: "Next.js",
    requiredFiles: ["next.config.js", "next.config.ts"],
    requiredDependencies: [
      {
        name: "next",
      },
    ],
    commands: {
      build: {
        cmd: "next build",
      },
      dev: {
        cmd: "next dev",
        env: { NODE_ENV: "dev" },
      },
      run: {
        cmd: "next run",
        env: { NODE_ENV: "production" },
      },
    },
  },
];
