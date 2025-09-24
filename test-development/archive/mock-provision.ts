import { AppPlatform } from "../../../management/apps";
import {
  IProvisioningService,
  ProvisionFirebaseAppOptions,
  ProvisionFirebaseAppResponse,
} from "./provisioning-interface";

// Configuration templates
const IOS_CONFIG_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>API_KEY</key>
	<string>AIzaSyMockApiKey123456789</string>
	<key>CLIENT_ID</key>
	<string>123456789-mock.apps.googleusercontent.com</string>
	<key>REVERSED_CLIENT_ID</key>
	<string>com.googleusercontent.apps.123456789-mock</string>
	<key>GOOGLE_APP_ID</key>
	<string>{{GOOGLE_APP_ID}}</string>
	<key>GCM_SENDER_ID</key>
	<string>123456789</string>
	<key>BUNDLE_ID</key>
	<string>{{BUNDLE_ID}}</string>
	<key>PROJECT_ID</key>
	<string>{{PROJECT_ID}}</string>
	<key>PLIST_VERSION</key>
	<string>1</string>
	<key>STORAGE_BUCKET</key>
	<string>{{PROJECT_ID}}.appspot.com</string>
	<key>IS_ADS_ENABLED</key>
	<false/>
	<key>IS_ANALYTICS_ENABLED</key>
	<false/>
	<key>IS_GCM_ENABLED</key>
	<true/>
	<key>IS_SIGNIN_ENABLED</key>
	<true/>
</dict>
</plist>`;

const ANDROID_CONFIG_TEMPLATE = `{
  "project_info": {
    "project_number": "123456789",
    "project_id": "{{PROJECT_ID}}",
    "storage_bucket": "{{PROJECT_ID}}.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "{{GOOGLE_APP_ID}}",
        "android_client_info": {
          "package_name": "{{PACKAGE_NAME}}"
        }
      },
      "oauth_client": [
        {
          "client_id": "123456789-mock.apps.googleusercontent.com",
          "client_type": 3
        }
      ],
      "api_key": [
        {
          "current_key": "AIzaSyMockApiKey123456789"
        }
      ],
      "services": {
        "appinvite_service": {
          "other_platform_oauth_client": [
            {
              "client_id": "123456789-mock.apps.googleusercontent.com",
              "client_type": 3
            }
          ]
        }
      }
    }
  ],
  "configuration_version": "1"
}`;

const WEB_CONFIG_TEMPLATE = `{
  "apiKey": "AIzaSyMockApiKey123456789",
  "authDomain": "{{PROJECT_ID}}.firebaseapp.com",
  "projectId": "{{PROJECT_ID}}",
  "storageBucket": "{{PROJECT_ID}}.appspot.com",
  "messagingSenderId": "123456789",
  "appId": "{{GOOGLE_APP_ID}}"
}`;

/**
 * Mock provisioning service that mimics the real Firebase provisioning API
 * without making actual network calls. Uses inline config templates for realistic responses.
 */
export class MockProvisioningService implements IProvisioningService {
  async provisionFirebaseApp(
    options: ProvisionFirebaseAppOptions,
  ): Promise<ProvisionFirebaseAppResponse> {
    // Validate inputs similar to real service
    this.validateOptions(options);

    // Generate realistic mock response
    const projectId = this.resolveProjectId(options.project, options.app);
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

  private resolveProjectId(project: any, app: any): string {
    // Check if using existing project
    if (project.parent?.type === "existing_project") {
      return project.parent.projectId;
    }

    // Otherwise generate new project ID
    return this.generateMockProjectId(project.displayName, app);
  }

  private generateMockProjectId(displayName: string | undefined, app: any): string {
    let baseName: string;

    if (displayName) {
      // Use display name if provided
      baseName = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    } else {
      // Auto-generate from app details when no display name
      if (app.bundleId) {
        // iOS: use bundle ID
        baseName = app.bundleId.toLowerCase().replace(/\./g, "-");
      } else if (app.packageName) {
        // Android: use package name
        baseName = app.packageName.toLowerCase().replace(/\./g, "-");
      } else if (app.webAppId) {
        // Web: use web app ID
        baseName = `web-${app.webAppId.toLowerCase()}`;
      } else {
        // Fallback
        baseName = `auto-generated-${app.platform}`;
      }
    }

    return `${baseName}-abc123`;
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
    let configContent: string;

    // Use appropriate template
    switch (platform) {
      case AppPlatform.IOS:
        configContent = IOS_CONFIG_TEMPLATE.replace(/{{PROJECT_ID}}/g, projectId)
          .replace(/{{BUNDLE_ID}}/g, app.bundleId)
          .replace(/{{GOOGLE_APP_ID}}/g, this.generateMockAppId(platform));
        break;
      case AppPlatform.ANDROID:
        configContent = ANDROID_CONFIG_TEMPLATE.replace(/{{PROJECT_ID}}/g, projectId)
          .replace(/{{PACKAGE_NAME}}/g, app.packageName)
          .replace(/{{GOOGLE_APP_ID}}/g, this.generateMockAppId(platform));
        break;
      case AppPlatform.WEB:
        configContent = WEB_CONFIG_TEMPLATE.replace(/{{PROJECT_ID}}/g, projectId).replace(
          /{{GOOGLE_APP_ID}}/g,
          this.generateMockAppId(platform),
        );
        break;
      default:
        throw new Error("Unsupported platform");
    }

    // Return base64 encoded config
    return Buffer.from(configContent, "utf8").toString("base64");
  }
}
