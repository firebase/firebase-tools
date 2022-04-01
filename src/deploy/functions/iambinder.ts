import { createHash } from "crypto";

import * as iam from "../../gcp/iam";
import * as secretManager from "../../gcp/secretManager";
import * as resourceManager from "../../gcp/resourceManager";
import * as backend from "./backend";
import * as storage from "../../gcp/storage";
import * as v2Events from "../../functions/events/v2";
import { assertExhaustive } from "../../functional";

type ResourceManagerResource = `//cloudresourcemanager.googleapis.com/projects/${string}`;
type SecretManagerResource = `//secretmanager.googleapis.com/projects/${string}/secrets/${string}`;
type Resource = ResourceManagerResource | SecretManagerResource;

function isResourceManagerResource(r: Resource): r is ResourceManagerResource {
  return r.startsWith("//cloudresourcemanager.googleapis.com/");
}
function isSecreteManagerResource(r: Resource): r is SecretManagerResource {
  return r.startsWith("//secretmanager.googleapis.com/");
}

/* @internal */
/**
 * Construct URL components by splitting up full resource name.
 */
export function splitResource(r: Resource): { service: string; resource: string } | undefined {
  const match = /\/\/(?<service>[^/]+)\/(?<resource>.+)/.exec(r);
  if (!match?.groups) {
    return undefined;
  }
  return { service: match.groups.service, resource: match.groups.resource };
}

export type Role = `roles/${string}`;

function isRole(s: string): s is Role {
  return s.startsWith("roles/");
}

interface IamBinding extends Omit<iam.Binding, "members" | "role"> {
  role: Role;
  members: Set<string>;
}

/* @internal */
export class IamBindings {
  additions: Record<Role, Record<string, IamBinding>>; // role -> condition -> bindings

  constructor() {
    this.additions = {};
  }

  add(role: Role, members: string[], condition?: iam.Binding["condition"]): void {
    const conditions = this.additions[role] || {};
    const conditionKey = condition ? IamBindings.getConditionKey(condition) : "";
    const binding = conditions[conditionKey] || { role, members: new Set() };
    if (condition) {
      binding.condition = { ...condition };
    }

    for (const member of members) {
      binding.members.add(member);
    }

    conditions[conditionKey] = binding;
    this.additions[role] = conditions;
  }

  diff(base: IamBindings): IamBindings {
    const diff = this.clone();
    for (const { role, members, condition } of base.allBindings()) {
      const conditionKey = condition ? IamBindings.getConditionKey(condition) : "";
      if (diff.additions[role]?.[conditionKey]) {
        for (const member of members) {
          diff.additions[role][conditionKey].members.delete(member);
        }
        if (diff.additions[role][conditionKey].members.size === 0) {
          delete diff.additions[role][conditionKey];
        }
        if (Object.keys(diff.additions[role]).length === 0) {
          delete diff.additions[role];
        }
      }
    }
    return diff;
  }

  merge(other: IamBindings): IamBindings {
    const merged = new IamBindings();
    for (const bindings of [this, other]) {
      for (const binding of bindings.allBindings()) {
        merged.add(binding.role, Array.from(binding.members), binding.condition);
      }
    }
    return merged;
  }

  clone(): IamBindings {
    const copied = new IamBindings();
    for (const binding of this.allBindings()) {
      copied.add(binding.role, Array.from(binding.members), binding.condition);
    }
    return copied;
  }

  asIamBindings(): iam.Binding[] {
    const iamBindings: iam.Binding[] = [];
    for (const binding of this.allBindings()) {
      const copy: iam.Binding = { role: binding.role, members: Array.from(binding.members) };
      if (binding.condition) {
        copy.condition = { ...binding.condition };
      }
      iamBindings.push(copy);
    }
    return iamBindings;
  }

  private *allBindings(): Generator<IamBinding> {
    for (const role of Object.keys(this.additions) as Role[]) {
      for (const conditionKey of Object.keys(this.additions[role])) {
        yield this.additions[role][conditionKey];
      }
    }
  }

  private static getConditionKey(condition: iam.Binding["condition"]): string {
    return createHash("md5").update(JSON.stringify(condition)).digest("base64");
  }

  static fromIamBindings(bindings: iam.Binding[]): IamBindings {
    const bindingInternal = new IamBindings();
    for (const { role, members, condition } of bindings) {
      if (!isRole(role)) {
        throw new Error(`Invalid role. Role ${role} must be prefixed with "roles/"`);
      }
      bindingInternal.add(role, members, condition);
    }
    return bindingInternal;
  }
}

/**
 * IamBinder generates necessary IAM binding given different types of function endpoints.
 */
export class IamBinder {
  additions: Record<Resource, IamBindings>; // resource -> bindings
  storageServiceAccount: string | undefined;

  constructor(private readonly projectId: string, private readonly projectNumber: string) {
    this.additions = {};
  }

  async apply(): Promise<iam.Policy[]> {
    const updates = Object.entries(this.additions).map(async ([resource, bindings]) => {
      return await IamBinder.updatePolicy(resource as Resource, bindings);
    });
    return Promise.all(updates);
  }

  async addEndpoints(endpoints: backend.Endpoint[]): Promise<void> {
    for (const endpoint of endpoints) {
      await this.addEndpoint(endpoint);
    }
  }

  private async addEndpoint(endpoint: backend.Endpoint): Promise<void> {
    let serviceAccount = this.defaultComputeServiceAccount(endpoint);
    if (endpoint.serviceAccountEmail && endpoint.serviceAccountEmail !== "default") {
      serviceAccount = `serviceAccount:${endpoint.serviceAccountEmail}`;
    }

    for (const secret of endpoint.secretEnvironmentVariables || []) {
      this.addBinding(
        `//secretmanager.googleapis.com/projects/${this.projectNumber}/secrets/${secret.secret}`,
        "roles/secretmanager.secretAccessor",
        [serviceAccount]
      );
    }

    if (backend.isEventTriggered(endpoint)) {
      if (endpoint.platform === "gcfv2") {
        // Eventarc requires pubsub service account to have serviceAccountTokenCreator role.
        // See https://cloud.google.com/eventarc/docs/roles-permissions#triggertypes-roles.
        this.addBinding(
          `//cloudresourcemanager.googleapis.com/projects/${this.projectNumber}`,
          "roles/iam.serviceAccountTokenCreator",
          [`serviceAccount:service-${this.projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`]
        );
        // Service account associated w/ eventarc trigger must have permission to invoke a Cloud Run instance.
        // We don't allow users to specify this service account hence it will always be the default compute service
        // account. Usually, the default service account has EDITOR role which includes permission to invoke a Cloud
        // Run instance, but given strict org policy it may not have this permission.
        // See https://cloud.google.com/compute/docs/access/service-accounts#default_service_account.
        this.addBinding(
          `//cloudresourcemanager.googleapis.com/projects/${this.projectNumber}`,
          "roles/run.invoker",
          [this.defaultComputeServiceAccount(endpoint)]
        );
        if (v2Events.isStorageTriggered(endpoint)) {
          // Storage account associated w/ Cloud Storage must have permission to publish pubsub messages.
          this.addBinding(
            `//cloudresourcemanager.googleapis.com/projects/${this.projectNumber}`,
            "roles/pubsub.publisher",
            [await this.fetchStorageServiceAccount()]
          );
        }
      }
    }
  }

  private addBinding(resource: Resource, role: Role, members: string[]): void {
    const bindings = this.additions[resource] || new IamBindings();
    bindings.add(role, members);
    this.additions[resource] = bindings;
  }

  private async fetchStorageServiceAccount(): Promise<string> {
    if (!this.storageServiceAccount) {
      const resp = await storage.getServiceAccount(this.projectId);
      this.storageServiceAccount = `serviceAccount:${resp.email_address}`;
    }
    return this.storageServiceAccount;
  }

  private defaultComputeServiceAccount(endpoint: backend.Endpoint): string {
    if (endpoint.platform === "gcfv1") {
      return `serviceAccount:${this.projectId}@appspot.gserviceaccount.com`;
    } else if (endpoint.platform === "gcfv2") {
      return `serviceAccount:${this.projectNumber}-compute@developer.gserviceaccount.com`;
    }
    assertExhaustive(endpoint.platform);
  }

  static async updatePolicy(resource: Resource, bindings: IamBindings): Promise<iam.Policy> {
    const existingPolicy = await IamBinder.getPolicy(resource);
    const existingBindings = IamBindings.fromIamBindings(existingPolicy.bindings || []);

    const diffBindings = bindings.diff(existingBindings);
    if (Object.keys(diffBindings.additions).length === 0) {
      return existingPolicy;
    }

    const mergedPolicy = {
      ...existingPolicy,
      bindings: bindings.merge(existingBindings).asIamBindings(),
    };
    await IamBinder.setPolicy(resource, mergedPolicy);
    return mergedPolicy;
  }

  static async getPolicy(resource: Resource): Promise<iam.Policy> {
    const parts = splitResource(resource);
    if (!parts) {
      throw new Error(`Invalid resource name: ${resource}`);
    }
    const resourceName = parts.resource;

    if (isSecreteManagerResource(resource)) {
      const [, projectId, , secretId] = resourceName.split("/");
      return await secretManager.getIamPolicy({ name: secretId, projectId });
    } else if (isResourceManagerResource(resource)) {
      const [, projectId] = resourceName.split("/");
      return await resourceManager.getIamPolicy(projectId);
    } else {
      assertExhaustive(resource);
    }
  }

  static async setPolicy(resource: Resource, policy: iam.Policy): Promise<iam.Policy> {
    const parts = splitResource(resource);
    if (!parts) {
      throw new Error(`Invalid resource name: ${resource}`);
    }
    const resourceName = parts.resource;

    if (isSecreteManagerResource(resource)) {
      const [, projectId, , secretId] = resourceName.split("/");
      return await secretManager.setIamPolicy({ name: secretId, projectId }, policy);
    } else if (isResourceManagerResource(resource)) {
      const [, projectId] = resourceName.split("/");
      return await resourceManager.setIamPolicy(projectId, policy);
    } else {
      assertExhaustive(resource);
    }
  }
}
