import { FunctionsEmulator } from "../../emulator/functionsEmulator";
import * as supertest from "supertest";

describe.only("Hub", () => {
  it("should route requests to /:project_id/:trigger_id to HTTPS Function", async () => {
    supertest(FunctionsEmulator.createHubServer())
  });
});
