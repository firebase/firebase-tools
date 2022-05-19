import { EmulatorHub, Locator, GetEmulatorsResponse } from "./hub";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";

export class EmulatorHubClient {
  private locator: Locator | undefined;
  private apiClient: Client;

  constructor(private projectId: string) {
    this.locator = EmulatorHub.readLocatorFile(projectId);
    this.apiClient = new Client({ urlPrefix: this.origin, auth: false });
  }

  foundHub(): boolean {
    return this.locator !== undefined;
  }

  async getStatus(): Promise<void> {
    await this.apiClient.get("/");
  }

  async getEmulators(): Promise<GetEmulatorsResponse> {
    const res = await this.apiClient.get<GetEmulatorsResponse>(EmulatorHub.PATH_EMULATORS);
    return res.body;
  }

  async postExport(path: string): Promise<void> {
    await this.apiClient.post(EmulatorHub.PATH_EXPORT, { path });
  }

  get origin(): string {
    const locator = this.assertLocator();
    return `http://${locator.host}:${locator.port}`;
  }

  private assertLocator(): Locator {
    if (this.locator === undefined) {
      throw new FirebaseError(`Cannot contact the Emulator Hub for project ${this.projectId}`);
    }

    return this.locator;
  }
}
