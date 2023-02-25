import { firestoreOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError } from "../error";

// todo add enums for possible string values
interface Database {
  name: string;
  uid: string;
  createTime: string;
  updateTime: string;
  locationId: string;
  type: string;
  concurrencyMode: string;
  appEngineIntegrationMode: string;
  keyPrefix: string;
  etag: string;
}

export class FirestoreProvisioning {
  private project: string;
  private apiClient: Client;

  constructor(project: string) {
    this.project = project;
    this.apiClient = new Client({ urlPrefix: firestoreOrigin, apiVersion: "v1" });
  }

  /**
   * Lists databases for project
   * todo b/267473272 refactor this into a comprehensive package for Provisioning API
   */
  public async listDatabases(): Promise<Database[]> {
    return (
      await this.apiClient.get<{ databases?: Database[] }>(`projects/${this.project}/databases`)
    ).body.databases as Database[];
  }

  DATABASE_NAME_REGEX = /projects\/([^\/]+?)\/databases\/([^\/]*)/;
  public async listDatabaseNames(): Promise<string[]> {
    const databases: Database[] = await this.listDatabases();
    if (!databases) {
      Promise.resolve([]);
    }
    return databases.map((databaseObj: Database) => {
      const name = databaseObj.name;

      const m = name.match(this.DATABASE_NAME_REGEX);
      if (!m || m.length < 3) {
        throw new FirebaseError(`Error parsing database name: ${name}`);
      }
      return m[2];
    });
  }
}
