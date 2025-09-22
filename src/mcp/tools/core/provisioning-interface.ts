import type {
  ProvisionFirebaseAppOptions,
  ProvisionFirebaseAppResponse,
} from "../../../management/provision";

/**
 * Shared interface for provisioning services (real and mock implementations)
 */
export interface IProvisioningService {
  provisionFirebaseApp(options: ProvisionFirebaseAppOptions): Promise<ProvisionFirebaseAppResponse>;
}

// Re-export types for convenience
export type { ProvisionFirebaseAppOptions, ProvisionFirebaseAppResponse };

