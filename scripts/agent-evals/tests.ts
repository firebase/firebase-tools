import { AgentTestCase, AgentTestRunner } from "./runner/index.js";

export const tests: AgentTestCase[] = [
  {
    name: "/firebase:init backend app",
    test: async (run: AgentTestRunner) => {
      await run.type("/firebase:init");
      await run.expectText("Backend Services");
      await run.expectText("AI Logic");

      await run.type("Build a single page backend app with html and pure javascript. It should say Hello World, but let you login and edit the hello world text for your user");

      await run.type("Yes that looks good. Use Firebase Project gcli-ext-sam-01");
    },
  },
];
