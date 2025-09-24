import { resource } from "../../resource";

export const init_auth = resource(
  {
    uri: "firebase://guides/init/auth",
    name: "auth_init_guide",
    title: "Firebase Authentication Init Guide",
    description:
      "guides the coding agent through configuring Firebase Authentication in the current project",
  },
  async (uri) => {
    return {
      contents: [
        {
          uri,
          type: "text",
          text: `
### Configure Firebase Authentication

- **Permission Required**: Request developer permission before implementing authentication features
- **Provider Setup**: Guide developers to enable authentication providers (Email/Password, Google Sign-in, etc.) in the [Firebase Auth Console](https://console.firebase.google.com/). Ask developers to confirm which authentication method they selected before proceeding to implementation.
- **Implementation**: Create sign-up and login pages using Firebase Authentication.
- **Security Rules**: Update Firestore security rules to ensure only authenticated users can access their own data
- **Testing**: Recommend developers test the complete sign-up and sign-in flow to verify authentication functionality
- **Next Steps**: Recommend deploying the application to production once authentication is verified and working properly
`.trim(),
        },
      ],
    };
  },
);
