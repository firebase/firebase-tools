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
    id: "angular",
    runtime: "nodejs",
    webFrameworkId: "Angular",
    requiredFiles: ["angular.json"],
    requiredDependencies: [
      {
        name: "@angular/core",
      },
      {
        name: "@angular/cli",
      },
    ],
    commands: {
      build: {
        cmd: "npm run build",
      },
      dev: {
        cmd: "npm run start",
        env: { NODE_ENV: "dev" },
      },
      run: {
        cmd: "node server.js",
        env: { NODE_ENV: "production" },
      },
    },
  },
  {
    id: "nextjs",
    runtime: "nodejs",
    requiredFiles: [["next.config.js"]],
    requiredDependencies: [{ name: "next" }],
  },
  {
    id: "astro",
    runtime: "nodejs",
    requiredFiles: [["astro.config.mjs", "astro.config.cjs", "astro.config.js", "astro.config.ts"]],
    requiredDependencies: [{ name: "astrojs" }],
    embedsFrameworks: ["svelte", "react", "vite"],
    commands: {
      build: {
        cmd: "astro build",
      },
      dev: {
        cmd: "astro",
        env: { NODE_ENV: "dev" },
      },
      run: {
        cmd: "node ./dist/server/entry.mjs",
        env: { NODE_ENV: "production" },
      },
    },
  },
  {
    id: "react",
    runtime: "nodejs",
    requiredDependencies: [{ name: "react" }, { name: "react-dom" }],
  },
  {
    id: "react-vite",
    runtime: "vite",
    requiredDependencies: [{ name: "react" }, { name: "react-dom" }],
    // vars: { vitePlugin: "react-jsx" },
  },
  {
    id: "svelte",
    runtime: "nodejs",
    requiredDependencies: [{ name: "svelte" }],
  },
  {
    id: "svelte-vite",
    runtime: "vite",
    requiredDependencies: [{ name: "svelte" }],
    embedsFrameworks: ["svelte"],
    // vars: { vitePlugin: "vite-plugin-svelte" },
  },
  {
    id: "sveltekit",
    runtime: "svelte",
    requiredDependencies: [{ name: "@sveltejs/kit" }],
  },
  {
    id: "vite",
    runtime: "nodejs",
    requiredDependencies: [{ name: "vite" }],
    commands: {
      build: {
        cmd: "vite build",
      },
      dev: {
        cmd: "vite",
        env: { NODE_ENV: "dev" },
      },
    },
  },
];
