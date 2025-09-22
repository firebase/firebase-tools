import * as fs from "fs-extra";
import * as path from "path";
import { AppPlatform } from "../../../management/apps";
import {
  IProvisioningService,
  ProvisionFirebaseAppOptions,
  ProvisionFirebaseAppResponse,
} from "./provisioning-interface";

/**
 * Mock provisioning service that mimics the real Firebase provisioning API
 * without making actual network calls. Uses config templates for realistic responses.
 */
export class MockProvisioningService implements IProvisioningService {
  async provisionFirebaseApp(
    options: ProvisionFirebaseAppOptions,
  ): Promise<ProvisionFirebaseAppResponse> {
    // Validate inputs similar to real service
    this.validateOptions(options);

    // Generate realistic mock response
    const projectId = this.generateMockProjectId(options.project.displayName || "test-project");
    const appId = this.generateMockAppId(options.app.platform);
    const configData = await this.generateMockConfigData(
      options.app.platform,
      projectId,
      options.app,
    );

    return {
      configMimeType: this.getConfigMimeType(options.app.platform),
      configData: configData,
      appResource: `projects/${projectId}/apps/${appId}`,
    };
  }

  private validateOptions(options: ProvisionFirebaseAppOptions): void {
    if (!options.project.displayName) {
      throw new Error("Project display name is required");
    }

    if (!options.app.platform) {
      throw new Error("App platform is required");
    }

    // Platform-specific validation
    switch (options.app.platform) {
      case AppPlatform.IOS:
        if (!options.app.bundleId) {
          throw new Error("Bundle ID is required for iOS apps");
        }
        break;
      case AppPlatform.ANDROID:
        if (!options.app.packageName) {
          throw new Error("Package name is required for Android apps");
        }
        break;
      case AppPlatform.WEB:
        if (!options.app.webAppId) {
          throw new Error("Web app ID is required for Web apps");
        }
        break;
      default:
        throw new Error("Unsupported platform");
    }
  }

  private generateMockProjectId(displayName: string): string {
    // Generate realistic project ID from display name
    const normalizedName = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    return `${normalizedName}-abc123`;
  }

  private generateMockAppId(platform: AppPlatform): string {
    // Generate realistic app ID based on platform
    const platformSuffix =
      platform === AppPlatform.IOS ? "ios" : platform === AppPlatform.ANDROID ? "android" : "web";
    return `1:123456789:${platformSuffix}:abc123def456`;
  }

  private getConfigMimeType(platform: AppPlatform): string {
    switch (platform) {
      case AppPlatform.IOS:
        return "text/xml";
      case AppPlatform.ANDROID:
      case AppPlatform.WEB:
        return "application/json";
      default:
        return "application/json";
    }
  }

  private async generateMockConfigData(
    platform: AppPlatform,
    projectId: string,
    app: any,
  ): Promise<string> {
    let templatePath: string;
    let configContent: string;

    // Load appropriate template
    switch (platform) {
      case AppPlatform.IOS:
        templatePath = path.join(__dirname, "templates", "ios-config.plist");
        configContent = await fs.readFile(templatePath, "utf8");
        configContent = configContent
          .replace(/{{PROJECT_ID}}/g, projectId)
          .replace(/{{BUNDLE_ID}}/g, app.bundleId)
          .replace(/{{GOOGLE_APP_ID}}/g, this.generateMockAppId(platform));
        break;
      case AppPlatform.ANDROID:
        templatePath = path.join(__dirname, "templates", "android-config.json");
        configContent = await fs.readFile(templatePath, "utf8");
        configContent = configContent
          .replace(/{{PROJECT_ID}}/g, projectId)
          .replace(/{{PACKAGE_NAME}}/g, app.packageName)
          .replace(/{{GOOGLE_APP_ID}}/g, this.generateMockAppId(platform));
        break;
      case AppPlatform.WEB:
        templatePath = path.join(__dirname, "templates", "web-config.json");
        configContent = await fs.readFile(templatePath, "utf8");
        configContent = configContent
          .replace(/{{PROJECT_ID}}/g, projectId)
          .replace(/{{GOOGLE_APP_ID}}/g, this.generateMockAppId(platform));
        break;
      default:
        throw new Error("Unsupported platform");
    }

    // Return base64 encoded config
    return Buffer.from(configContent, "utf8").toString("base64");
  }
}
