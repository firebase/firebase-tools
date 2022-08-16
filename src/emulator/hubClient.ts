import { EmulatorHub, Locator, GetEmulatorsResponse } from "./hub";
import { FirebaseError } from "../error";
import { Client } from "../apiv2";
import { ExportOptions } from "./hubExport";

export class EmulatorHubClient {
  private locator: Locator | undefined;

  constructor(private projectId: string) {
    this.locator = EmulatorHub.readLocatorFile(projectId);
  }

  foundHub(): boolean {
    return this.locator !== undefined;
  }

  async getStatus(): Promise<void> {
    const apiClient = new Client({ urlPrefix: this.origin, auth: false });
    await apiClient.get("/");
  }

  async getEmulators(): Promise<GetEmulatorsResponse> {
    const apiClient = new Client({ urlPrefix: this.origin, auth: false });
    const res = await apiClient.get<GetEmulatorsResponse>(EmulatorHub.PATH_EMULATORS);
    return res.body;
  }

  async postExport(options: ExportOptions): Promise<void> {
    const apiClient = new Client({ urlPrefix: this.origin, auth: false });
    await apiClient.post(EmulatorHub.PATH_EXPORT, options);
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
