import { setupEnvironment } from "../runner/index";

export async function mochaGlobalSetup() {
  await setupEnvironment();
}
