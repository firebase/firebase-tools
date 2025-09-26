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

**Authentication Setup:**
- Request developer permission before implementing sign-up and login features
- Guide developers to enable authentication providers (Email/Password, Google Sign-in, etc.) in the [Firebase Auth Console](https://console.firebase.google.com/)
- Ask developers to confirm which authentication method they selected before proceeding

**Implementation:**
- Create sign-up and login pages using Firebase Authentication 

**Security Rules Integration:**
- Update Firestore security rules to ensure only authenticated users can access their own data
- Explain to users in plain language how the current security rules work and ask their confirmation before deploying
- Deploy updated security rules using \`firebase deploy\`
- Guide users to navigate to console review the deployed security rules
- **Critical Warning**: Never make Firestore security rules public (allowing read/write without authentication)

**Verification & Testing:**
- Test the complete sign-up and sign-in flow to verify authentication functionality
- Confirm user data is properly isolated and secure
- Verify that security rules properly restrict data access to authenticated users only
- Test user session management and logout functionality

**Next Steps:**
- **Production Deployment**: Recommend deploying the application to production once authentication is verified and working properly
- **User Management**: Consider implementing additional user management features (password reset, account deletion, profile management, etc.)
- **Additional Auth Providers**: Implement additional authentication providers by offering a menu of options (Google, GitHub, Apple, etc.)
- **Advanced Security**: Implement multi-factor authentication for enhanced security
`.trim(),
        },
      ],
    };
  },
);
