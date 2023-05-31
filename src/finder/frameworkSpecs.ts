import { FrameworkSpec } from "./types";

export const frameworkSpecs: FrameworkSpec[] = [
  {
    id: "core:express",
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
    requiredFiles: ["next.config.js", "next.config.ts"],
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
        cmd: "ng build",
      },
      dev: {
        cmd: "ng run",
        env: { NODE_ENV: "dev" },
      },
      run: {
        cmd: "ng run",
        env: { NODE_ENV: "production" },
      },
    },
  },
  {
    id: "core:nextjs",
    runtime: "nodejs",
    requiredFiles: [["next.config.js", "next.config.ts"]],
    requiredDependencies: [{ name: "next" }],
  },
  {
    id: "core:astro",
    runtime: "nodejs",
    requiredFiles: [["astro.config.mjs", "astro.config.cjs", "astro.config.js", "astro.config.ts"]],
    requiredDependencies: [{ name: "astrojs" }],
    embedsFrameworks: ["core:svelte", "core:react", "core:vite"],
    commands: {
      build: {
        cmd: "astro build",
      },
      dev: {
        cmd: "astro preview",
        env: { NODE_ENV: "dev" },
      },
      run: {
        cmd: "astro deploy",
        env: { NODE_ENV: "production" },
      },
    },
  },
  {
    id: "core:react",
    runtime: "nodejs",
    requiredDependencies: [{ name: "react" }, { name: "react-dom" }],
  },
  {
    id: "core:react-vite",
    runtime: "core:vite",
    requiredDependencies: [{ name: "react" }, { name: "react-dom" }],
    // vars: { vitePlugin: "react-jsx" },
  },
  {
    id: "core:svelte",
    runtime: "nodejs",
    requiredDependencies: [{ name: "svelte" }],
  },
  {
    id: "core:svelte-vite",
    runtime: "core:vite",
    requiredDependencies: [{ name: "svelte" }],
    embedsFrameworks: ["core:svelte"],
    // vars: { vitePlugin: "vite-plugin-svelte" },
  },
  {
    id: "core:sveltekit",
    runtime: "core:svelte",
    requiredDependencies: [{ name: "@sveltejs/kit" }],
  },
  {
    id: "core:vite",
    runtime: "nodejs",
    requiredDependencies: [{ name: "vite" }],
    commands: {
      build: {
        cmd: "vite build",
      },
      dev: {
        cmd: "vite preview",
        env: { NODE_ENV: "dev" },
      },
    },
  },
];
