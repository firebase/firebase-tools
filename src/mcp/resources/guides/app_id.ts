import { resource } from "../../resource";

export const app_id = resource(
  {
    uri: "firebase://guides/app_id",
    name: "app_id_guide",
    title: "Firebase App Id Guide",
    description:
      "guides the coding agent through choosing a Firebase App ID in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Firebase App ID
  The Firebase App ID is used to identify a mobile or web client application to Firebase back end services such as Crashlytics or Remote Config. Use the information below to find the developer's App ID.

  * **Description:** The App ID we are looking for contains four colon (":") delimited parts: a version number (typically "1"), a project number, a platform type ("android", "ios", or "web"), and a sequence of hexadecimal characters. This can be found in the project settings in the Firebase Console or in the appropriate google services file for the application type.
  * For Android apps, you will typically find the App ID in a file called \`google-services.json\` under the \`mobilesdk_app_id key\`. The file is most often located in the app directory that contains the src directory.
  * For iOS apps, you will typically find the App ID in a property list file called \`GoogleService-Info.plist\` under the \`GOOGLE_APP_ID\` key. The plist file is most often located in the main project directory.
  * Sometimes developers will not check in the google services file because it is a shared or public repository. If you can't find the file, the files may be included in the .gitignore. Check again for the file removing restrictions around looking for tracked files.
  * Developers may have multiple google services files that map to different releases. In cases like this, developers may create different directories to hold each like alpha/google-services.json or alpha/GoogleService-Info.plist. In other cases, developers may change the suffix of the file to something like google-services-alpha.json or GoogleService-Alpha.plist. Look for as many google services files as you can find.
  * Sometimes developers may include the codebase for both the Android app and the iOS app in the same repository.
     
  If there are multiple files or multiple App IDs in a single file, ask the user to choose one by providing a numbered list of all the package names.
  If you have trouble finding the App ID, just ask the user for the ID to use.
`.trim(),
        },
      ],
    };
  },
);
