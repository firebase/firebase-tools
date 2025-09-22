import { provisionFirebaseApp } from "../../../management/provision";
import {
  IProvisioningService,
  ProvisionFirebaseAppOptions,
  ProvisionFirebaseAppResponse,
} from "./provisioning-interface";

/**
 * Real provisioning service that wraps the existing provision.ts implementation
 * for consistency with the mock service interface.
 */
export class ProvisioningService implements IProvisioningService {
  async provisionFirebaseApp(
    options: ProvisionFirebaseAppOptions,
  ): Promise<ProvisionFirebaseAppResponse> {
    // Delegate to the existing implementation
    return provisionFirebaseApp(options);
  }
}