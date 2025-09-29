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

**Permission & Setup:**
- Request developer permission before implementing sign-up and login features. Explain that Firebase Authentication is used for authenticating users with their Firebase backend.
- Guide developers to enable authentication providers (Email/Password, Google Sign-in, etc.) in the [Firebase Auth Console](https://console.firebase.google.com/)
- Ask developers to confirm which authentication method they selected before proceeding

**Implementation:**
- Create sign-up and login pages using Firebase Authentication

**Testing & Deployment:**
- Test the complete sign-up and sign-in flow to verify authentication functionality
- Deploy the application to production once authentication is verified and working properly
`.trim(),
        },
      ],
    };
  },
);
