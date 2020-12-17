import * as api from "../api";
import { EmulatorHub, Locator, GetEmulatorsResponse } from "./hub";
import { FirebaseError } from "../error";

export class EmulatorHubClient {
  private locator: Locator | undefined;

  constructor(private projectId: string) {
    this.locator = EmulatorHub.readLocatorFile(projectId);
  }

  foundHub(): boolean {
    return this.locator !== undefined;
  }

  getStatus(): Promise<void> {
    return api.request("GET", "/", {
      origin: this.origin,
    });
  }

  getEmulators(): Promise<GetEmulatorsResponse> {
    return api
      .request("GET", EmulatorHub.PATH_EMULATORS, {
        origin: this.origin,
        json: true,
      })
      .then((res) => {
        return res.body as GetEmulatorsResponse;
      });
  }

  postExport(path: string): Promise<void> {
    return api.request("POST", EmulatorHub.PATH_EXPORT, {
      origin: this.origin,
      json: true,
      data: {
        path,
      },
    });
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
