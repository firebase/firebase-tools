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

  /**
   * Ping possible hub origins for status and return the first successful.
   */
  getStatus(): Promise<string> {
    return this.tryOrigins(async (client, origin) => {
      await client.get("/");
      return origin;
    });
  }

  private async tryOrigins<T>(task: (client: Client, origin: string) => Promise<T>): Promise<T> {
    const origins = this.assertLocator().origins;
    let err: any = undefined;
    for (const origin of origins) {
      try {
        const apiClient = new Client({ urlPrefix: origin, auth: false });
        return await task(apiClient, origin);
      } catch (e) {
        if (!err) {
          err = e; // Only record the first error and only throw if all fails.
        }
      }
    }
    throw err ?? new Error("Cannot find working hub origin. Tried:" + origins.join(" "));
  }

  async getEmulators(): Promise<GetEmulatorsResponse> {
    const res = await this.tryOrigins((client) =>
      client.get<GetEmulatorsResponse>(EmulatorHub.PATH_EMULATORS),
    );
    return res.body;
  }

  async postExport(options: ExportOptions): Promise<void> {
    // This is a POST operation that should not be retried / multicast, so we
    // will try to find the right origin first via GET.
    const origin = await this.getStatus();
    const apiClient = new Client({ urlPrefix: origin, auth: false });
    await apiClient.post(EmulatorHub.PATH_EXPORT, options);
  }

  private assertLocator(): Locator {
    if (this.locator === undefined) {
      throw new FirebaseError(`Cannot contact the Emulator Hub for project ${this.projectId}`);
    }

    return this.locator;
  }
}
