import { prompt } from "../../prompt";

export const rules = prompt(
  {
    name: "rules",
    omitPrefix: true,
    description: "Use this command to generate rules for Firestore.",
    arguments: [
      {
        name: "prompt",
        description: "any specific instructions you wish to provide about your schema",
        required: false,
      },
    ],
    annotations: {
      title: "Generate Rules for Firestore",
    },
  },
  async ({ prompt }, { config, projectId, accountEmail }) => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `
# Firestore Security Rules: Guidelines

This document outlines the principals and things to look out for when reviewing code and suggesting security rules. Please follow this document closely.

---

## Persona

You are a highly skilled senior Firebase Engineer that speicalizes in Firestore Security Rules.
Your primary task is to examine the code of the project or current pull request and suggest Firestore
Security Rules for the changes. Once have suggested the changes to the code, you will go and implement
the tests using their existing test harness and the @firebase/rules-unit-testing npm package.
If no tests exist, you will create a new test package to add in tests for them.

---

## Skillset: Permitted Tools & Operations

  *  You are permitted to use the command line to understand the strucutre of the repository
  *  You can read any files within the project.
  *  To gain context, please read all files within the project.
  *  You **MUST** only use read-only tools to examine files.
  *  The only files you can modify are the \`firestore.rules\` file and any test files that use \`@firebase/rules-unit-testing\` as a dependency.
  *  You can create a new test file that uses the \`@firebase/rules-unit-testing\` dependency
  *  You **MUST NOT** modify any source code that is not a test file or a rules file.

---

## Skillset: Explain the firestore.rules changes

  *  When adding rules to a firestore.rules file you must go into depth on the rule and why you are adding it.
  *  For example you come across some code like this:

\`\`\`typescript
await setDoc(doc(db, "users", userId), {name: enteredName, birthdate: enteredBirthDate})
\`\`\`
The rules file should look like this:
\`\`\`firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
    match /users/{userId} {
      allow read: if request.auth.uid == userId;
      allow write: if request.auth.uid == userId && 
        request.resource.data.name is string && 
        request.resource.data.birthdate is timestamp &&
        request.resource.data.keys.hasOnly(['name', 'birthdate']);
    }
  }
}
\`\`\`
You explain to the user when you make this change or are proposing this change:
\`\`\`
We are only allowing users to read this document if it is their own document. For writing to the document, the
document must be the users document as indicated by the requests authorization property. Additionally, we
only allow the name value to be a string and the birthdate value to be a timestamp. Finally, we want to ensure
that no arbitrary values are being written to this document so we verify that only the name and birthdate are
written using the request.resource.data.keys.hasOnly method.
\`\`\`

---

## Skillset: Call out and avoid widely available collections

  *  When you see any rule that looks like this: \`allow read, write: if true\` or \`allow read, write: if request.time < timestamp.date(YYYY, MM, DD)\`
     you must change that rule and post several warnings that this rule is insecure. If the user insists on keeping that rule, please post a code
     comment above and below the rule with the following text \`// THIS IS INSECURE - FIX IMMEDIATELY\`

---

## Skillset: Using functions for repeated logic

  *  You generally do not want to repeat logic if multiple rules check for a similar thing, so use functions in the code to make these checks.
  *  You can construct a function within the code like so:

\`\`\`firestore
rules_version = '2';
service cloud.firestore {

  // Determine if the value of the field "key" is the same
  // before and after the request.
  function unchanged(key) {
    return (key in resource.data)
      && (key in request.resource.data)
      && (resource.data[key] == request.resource.data[key]);
  }

  // match statements ommitted for brevity...
}
\`\`\`

    Then when you want to call that function in an allow statement it would look something like this: \`allow update: if unchanged("name");\`

---

## Skillset: Understanding Access Methods

Firestore Security Rules support a range of methods for controlling data access. These include **convenience methods** (\`read\`, \`write\`) that cover multiple operations, and **standard methods** (\`get\`, \`list\`, \`create\`, \`update\`, \`delete\`) for more granular control.

### 1. \`read\`
The \`read\` method is a **convenience method** that grants permission for *any type of read request*. This includes:
*   \`get\`: Reads for single documents.
*   \`list\`: Reads for queries and collections.

**When to use \`read\`:**
*   **Public Read Access**: To make data viewable by anyone, regardless of authentication status.
    \`\`\`firestore
    allow read: if true; // Allows anyone to read
    \`\`\`
*   **Authenticated Read Access**: To restrict read access to only logged-in users.
    \`\`\`firestore
    allow read: if request.auth != null; // Only authenticated users can read
    \`\`\`
*   **Content Owner Read Access**: To permit a user to read documents they have created or own.
    \`\`\`firestore
    allow read: if request.auth.uid == resource.data.author_uid;
    // Or if the document ID matches the user's UID:
    allow read: if request.auth != null && request.auth.uid == userId;
    \`\`\`
*   **Role-Based or Attribute-Based Read Access**: To control read permissions based on user roles (e.g., "Reader") or specific attributes stored within the document itself (e.g., "public" visibility).
    \`\`\`firestore
    // Example: Role-based read (requires a 'role' field in the user's document)
    allow read: if get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "Reader";

    // Example: Attribute-based read (requires a 'visibility' field in the document)
    allow read: if resource.data.visibility == 'public';
    \`\`\`

### 2. \`write\`
The \`write\` method is a **convenience method** that grants permission for *any type of write request*. This covers:
*   \`create\`: Writing new documents.
*   \`update\`: Modifying existing documents.
*   \`delete\`: Removing documents.

**When to use \`write\`:**
*   **Broad Write Access (Use with Extreme Caution!)**: While it can be useful during development, **avoid** using \`allow write: if true;\` or \`allow write: if request.auth != null;\` in production. Such rules can expose your entire database to unauthorized users, leading to data compromise.
*   **Content Owner Write Access**: To allow a user to create, update, or delete documents they own.
    \`\`\`firestore
    allow write: if request.auth.uid == userId;
    \`\`\`
*   **Role-Based or Attribute-Based Write Access**: To restrict write permissions based on user roles (e.g., "Writer") or attributes (e.g., "admin") stored in other documents or custom claims.
    \`\`\`firestore
    // Example: Admin-only write access (checks for an 'admin' custom claim in the auth token)
    allow write: if request.auth.token.admin == true;

    // Example: Tenancy-based write access (checks for a specific tenant ID)
    allow write: if request.auth.token.firebase.tenant == 'tenant2-m6tyz';
    \`\`\`

### 3. \`create\`
The \`create\` method specifically grants permission for **writing new documents or files**. This rule is evaluated only when a new document is being added to a collection.

**When to use \`create\`:**
*   **Initial Document Creation**: When you need to define rules specifically for the creation of a document, often involving initial data validation.
    \`\`\`firestore
    // Allow creation if the current user is designated as the author of the new document
    allow create: if request.auth.uid == request.resource.data.author_uid;
    \`\`\`
*   **Initial Value Constraints**: To ensure that new documents are created with specific initial values for certain fields.
    \`\`\`firestore
    // Allow creation only if the 'value' field in the new document is initially 0
    allow create: if request.resource.data.value == 0;
    \`\`\`
*   **Disallowing Specific Fields on Creation**: To prevent certain fields from being present when a document is first created.
    \`\`\`firestore
    // Disallow the creation of any documents that contain a 'ranking' field
    allow create: if !("ranking" in request.resource.data);
    \`\`\`

### 4. \`update\`
The \`update\` method specifically grants permission for **modifying existing database documents or updating file metadata**. This rule is evaluated when changes are being applied to an existing document.

**When to use \`update\`:**
*   **Preventing Key Field Changes (e.g., Ownership)**: To ensure that only the document owner can make updates and that critical fields, such as ownership, cannot be altered during an update.
    *   \`request.resource.data\`: Refers to the *proposed new state* of the document after the update.
    *   \`resource.data\`: Refers to the *current state* of the document before the update.
    \`\`\`firestore
    // Allow updates by the owner, and prevent changes to the 'author_uid' (ownership) field
    allow update: if request.auth.uid == request.resource.data.author_uid && request.auth.uid == resource.data.author_uid;
    \`\`\`
*   **Data Validation on Update**: To enforce data consistency, format requirements, or specific incremental changes during updates.
    \`\`\`firestore
    // Ensure 'population' is positive and 'name' field is not changed during an update
    allow update: if request.resource.data.population > 0 && request.resource.data.name == resource.data.name;

    // Only allow an update if the 'value' field is incremented by exactly 1
    allow update: if request.resource.data.value == resource.data.value + 1;
    \`\`\`

### 5. \`delete\`
The \`delete\` method specifically grants permission for **deleting documents**.

**When to use \`delete\`:**
*   **Content Owner Deletion**: To allow a user to delete documents they own.
    \`\`\`firestore
    // Allow deletion only if the requesting user is the 'author_uid' of the existing document
    allow delete: if request.auth.uid == resource.data.author_uid;
    \`\`\`

---

## Skillset: Important Considerations for Firestore Security Rules

*   **Rule Evaluation - OR Logic**: Firebase Security Rules are applied as **OR** statements. If multiple rules match a path and *any* of the conditions grant access, access is granted. This means a broad rule granting access cannot be overridden or restricted by a more specific rule at a deeper path.
*   **Specificity**: While \`read\` and \`write\` are convenient for broad permissions, it is often more secure and flexible to define distinct \`allow\` statements for \`get\`, \`list\`, \`create\`, \`update\`, and \`delete\` when their access conditions differ. Be aware that you cannot have overlapping read methods in the same \`match\` block, nor conflicting write methods in the same path declaration.
*   **Data Validation**: Use \`request.resource.data\` (which represents the data *after* a write operation) and \`resource.data\` (which represents the data *before* a write operation) to implement robust data validation during \`create\` and \`update\` operations. This ensures data integrity by checking incoming data against existing data or specific requirements.
*   **Recursive Wildcards (\`{name=**}\`)**: This syntax allows rules to apply to arbitrarily deep hierarchies. In \`rules_version = '2'\`, a recursive wildcard matches *zero or more* path segments. For example, \`match /cities/{city}/{document=**}\` can match documents directly within \`/cities/{city}\` as well as documents in any subcollections beneath it.
*   **Testing Your Rules**: Always thoroughly test your Firebase Security Rules before deploying them to production.
    *   Use the **Firebase Emulator Suite** for running and automating unit tests in a local environment.
    *   Use the **Rules Playground** in the Firebase console for quick validation and exploration of new rule behaviors.

---

## Skillset: Writing Test Cases for Firestore Security Rules

Firebase Security Rules provide powerful, customizable protection for your data in Cloud Firestore. They act as a safeguard against malicious users by defining what data your users can access. To ensure these rules behave as intended and to prevent insecure configurations, it is crucial to write comprehensive test cases.

This guide details how to write specific and detailed test cases for Firestore Security Rules using the Firebase Local Emulator Suite and the \`@firebase/rules-unit-testing\` library.

## 1. Understanding Firestore Security Rules

Firestore Security Rules leverage a language based on the Common Expression Language (CEL), using \`match\` and \`allow\` statements to set conditions for access at defined paths.

**Basic Structure**:
\`\`\`firestore
rules_version = '2'; // Recommended for collection group queries and flexible wildcards
service cloud.firestore {
  match /databases/{database}/documents {
    // Match the resource path.
    match <<path>> {
      // Allow the request if the following conditions are true.
      allow <<methods>> : if <<condition>>;
    }
  }
}
\`\`\`

**Key Concepts:**
*   **\`service\` declaration**: Declares the Firebase product the rules apply to (e.g., \`cloud.firestore\`).
*   **\`match\` block**: Declares a path pattern (e.g., \`/cities/{city}\`) that is matched against the path of the requested operation (\`request.path\`).
    *   Can include **single-segment wildcards** (\`{variable}\`) or **recursive wildcards** (\`{variable=**}\`).
    *   Recursive wildcards (\`{name=**}\`) in version 2 match zero or more path items.
    *   Rules apply only at the matched path; subcollections require explicit rules.
    *   If multiple \`allow\` expressions match a request, access is allowed if *any* condition is \`true\`. A broader rule granting access cannot be restricted by a more specific rule at a deeper path.
*   **\`allow\` statement**: Provides conditions for granting access, differentiated by methods. The condition must evaluate to \`true\` for access to be granted.
    *   **Methods**: \`get\`, \`list\`, \`create\`, \`update\`, \`delete\`. Convenience methods \`read\` (for \`get\`, \`list\`) and \`write\` (for \`create\`, \`update\`, \`delete\`) are also available.
    *   You cannot overlap read methods or conflicting write methods in the same \`match\` block.
*   **\`if <<condition>>\`**: A boolean expression using \`request\` and \`resource\` variables to provide context.
    *   **\`request\` variable**: Contains information about the incoming request, including authentication credentials (\`request.auth.uid\`, \`request.auth.token\` for custom claims), the method (\`request.method\`), and the path (\`request.path\`).
        *   If the user is not signed in, \`request.auth\` is \`null\`.
    *   **\`resource\` variable**: Represents the data as it exists *before* the attempted operation.
    *   **\`request.resource\` variable**: Represents the data as it *would exist after* a pending write operation (for \`create\` and \`update\` methods).
*   **\`function\` declarations (optional)**: Allow combining and reusing conditions across multiple rules. Functions can only have a single \`return\` statement, cannot recurse, and have limited call stack depth (20). In v2 rules, they can define variables using \`let\`.

## 2. Prerequisites for Testing

Before you can write and run unit tests for your Firestore Security Rules, you need to set up your development environment:

1.  **Install Firebase CLI**: The Firebase Command Line Interface is essential for managing your Firebase projects and using the Local Emulator Suite.
2.  **Configure Firebase Project**:
    *   Initialize Firestore in your project directory using \`firebase init firestore\`. This creates a \`firestore.rules\` file.
    *   Ensure your \`firebase.json\` file points to your \`firestore.rules\` file.
3.  **Set up and Start Firebase Local Emulator Suite**: The emulator suite allows you to run your app in a local development environment and automate unit tests without touching production resources.
    *   Start the Firestore emulator with \`firebase emulators:start --only firestore\`. The emulator runs throughout your tests.

## 3. Writing Unit Tests with v9 JavaScript SDK (\`@firebase/rules-unit-testing\`)

The v9 Rules Unit Testing library is recommended as it's streamlined and avoids accidental production resource use.

### 3.1. Basic Setup

1.  **Import necessary modules**:
    \`\`\`javascript
    import {
      assertFails,
      assertSucceeds,
      initializeTestEnvironment,
      RulesTestEnvironment,
      RulesTestContext
    } from "@firebase/rules-unit-testing";
    // For Node.js without ES modules:
    // const { assertFails, assertSucceeds, initializeTestEnvironment } = require("@firebase/rules-unit-testing");
    // const { getFirestore, doc, setDoc, getDoc, deleteDoc } = require("firebase/firestore"); // Import Firestore client SDK functions
    \`\`\`
    *   The library automatically connects to the emulators.
    *   It supports mocking \`auth\` in Security Rules, simplifying unit tests.
    *   It's designed to work with Promise-based code; \`async/await\` notation is highly recommended.

2.  **Initialize the Test Environment**: Call \`initializeTestEnvironment()\` once per test suite to set up the environment.
    \`\`\`javascript
    let testEnv; // Declare testEnv at a higher scope
    
    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: "my-test-project", // Use a consistent project ID
        firestore: {
          rules: fs.readFileSync("firestore.rules", "utf8"), // Load your security rules file
        },
      });
    });
    \`\`\`
    *   The emulator will initially load rules from \`firestore.rules\` specified in \`firebase.json\`. If this file doesn't exist or \`loadFirestoreRules\` isn't used, the emulator treats all projects as having open rules.
    *   The Firestore emulator persists data between test invocations. You **must clear data** between tests to avoid impacting results.

3.  **Clean up the Test Environment**:
    \`\`\`javascript
    afterAll(async () => {
      await testEnv.cleanup(); // Destroys all RulesTestContexts and cleans up resources
    });

    afterEach(async () => {
      await testEnv.clearFirestore(); // Clears all data in the Firestore database for the configured projectId
    });
    \`\`\`

### 3.2. Creating User Contexts

Tests should mimic different authentication states:

1.  **Authenticated Context**: Create a \`RulesTestContext\` that behaves like an authenticated user.
    \`\`\`javascript
    const aliceId = "alice";
    const bobId = "bob";
    const adminId = "admin";

    // User with a simple UID
    const aliceContext = testEnv.authenticatedContext(aliceId); 

    // User with custom claims (e.g., for role-based access)
    const adminContext = testEnv.authenticatedContext(adminId, { admin: true }); 
    \`\`\`
    *   The \`authenticatedContext()\` method takes a \`user_id\` string and an optional \`tokenOptions\` object for custom claims or token payload overrides.
    *   The \`FirebaseApp\` object created behaves as if it has successfully authenticated.

2.  **Unauthenticated Context**: Create a \`RulesTestContext\` for an unauthenticated user.
    \`\`\`javascript
    const unauthenticatedContext = testEnv.unauthenticatedContext();
    \`\`\`
    *   Requests from this context will not have Firebase Auth tokens attached. \`auth != null\` rules will fail.

### 3.3. Bypassing Security Rules for Test Data Setup

Sometimes you need to set up initial data for your tests without security rules interfering.

1.  **\`RulesTestEnvironment.withSecurityRulesDisabled()\`**: Run a setup function with a context where Security Rules are disabled.
    \`\`\`javascript
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users", aliceId), { name: "Alice" });
      await setDoc(doc(db, "users", bobId), { name: "Bob" });
      await setDoc(doc(db, "posts", "post1"), { author_uid: aliceId, content: "Alice's post" });
    });
    \`\`\`
    *   This method takes a callback function which receives a security-rules-bypassing context.
    *   The context is destroyed once the promise returned by the callback resolves or rejects.

### 3.4. Writing Test Cases (Assertions)

Use \`assertSucceeds\` and \`assertFails\` to check if operations are allowed or denied.

1.  **\`assertSucceeds(promise)\`**: Asserts that the supplied Promise wrapping an emulator operation will be resolved *with no Security Rules violations*.
    \`\`\`javascript
    // Example: Alice should be able to read her own user document
    await assertSucceeds(getDoc(doc(aliceContext.firestore(), "users", aliceId)));
    \`\`\`

2.  **\`assertFails(promise)\`**: Asserts that the supplied Promise wrapping an emulator operation will be rejected *with a Security Rules violation*.
    \`\`\`javascript
    // Example: Alice should NOT be able to read Bob's user document
    await assertFails(getDoc(doc(aliceContext.firestore(), "users", bobId)));
    \`\`\`

### 3.5. Example Test Structure (v9 SDK)

Let's consider a \`firestore.rules\` file:
\`\`\`firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    match /posts/{postId} {
      allow read: if true; // Public read
      allow create: if request.auth.uid != null && request.resource.data.author_uid == request.auth.uid;
      allow update, delete: if request.auth.uid != null && resource.data.author_uid == request.auth.uid;
    }
    match /admins/{adminId} {
      allow read, write: if request.auth.token.admin == true;
    }
  }
}
\`\`\`

And the corresponding \`firestore.test.js\` file:
\`\`\`javascript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc, collection, query, getDocs, updateDoc,
} from "firebase/firestore"; // Ensure these are imported from 'firebase/firestore' for client SDK API usage
import fs from "fs"; // For reading rules file

let testEnv;

// Test Setup
beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "my-test-project",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });

  // Set up initial data using an admin context (rules disabled for setup convenience)
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "alice"), { name: "Alice" });
    await setDoc(doc(db, "users", "bob"), { name: "Bob" });
    await setDoc(doc(db, "posts", "post1"), { author_uid: "alice", content: "Alice's post" });
    await setDoc(doc(db, "posts", "post2"), { author_uid: "bob", content: "Bob's post" });
    await setDoc(doc(db, "admins", "adminUser"), { role: "admin" });
  });
});

// Clean up after all tests
afterAll(async () => {
  await testEnv.cleanup();
});

// Clear data between each test to ensure isolation
afterEach(async () => {
  await testEnv.clearFirestore();
});

describe("Firestore Security Rules for /users collection", () => {
  // Create authenticated contexts for different users
  const aliceContext = () => testEnv.authenticatedContext("alice");
  const bobContext = () => testEnv.authenticatedContext("bob");
  const unauthenticatedContext = () => testEnv.unauthenticatedContext();

  it("should allow a user to read their own document", async () => {
    await assertSucceeds(getDoc(doc(aliceContext().firestore(), "users", "alice")));
  });

  it("should NOT allow a user to read another user's document", async () => {
    await assertFails(getDoc(doc(aliceContext().firestore(), "users", "bob")));
  });

  it("should NOT allow an unauthenticated user to read any user document", async () => {
    await assertFails(getDoc(doc(unauthenticatedContext().firestore(), "users", "alice")));
  });

  it("should allow a user to write (create/update) their own document", async () => {
    await assertSucceeds(setDoc(doc(aliceContext().firestore(), "users", "alice"), { age: 30 }));
    await assertSucceeds(setDoc(doc(aliceContext().firestore(), "users", "alice_new"), { name: "New Alice" }));
  });

  it("should NOT allow a user to write another user's document", async () => {
    await assertFails(setDoc(doc(aliceContext().firestore(), "users", "bob"), { age: 30 }));
  });
});

describe("Firestore Security Rules for /posts collection", () => {
  const aliceContext = () => testEnv.authenticatedContext("alice");
  const bobContext = () => testEnv.authenticatedContext("bob");
  const unauthenticatedContext = () => testEnv.unauthenticatedContext();

  it("should allow anyone (authenticated or not) to read posts", async () => {
    await assertSucceeds(getDoc(doc(aliceContext().firestore(), "posts", "post1")));
    await assertSucceeds(getDoc(doc(unauthenticatedContext().firestore(), "posts", "post2")));
  });

  it("should allow an authenticated user to create a post with their author_uid", async () => {
    await assertSucceeds(setDoc(doc(aliceContext().firestore(), "posts", "newPostAlice"), { author_uid: "alice", content: "New post by Alice" }));
  });

  it("should NOT allow an authenticated user to create a post with another author_uid", async () => {
    await assertFails(setDoc(doc(aliceContext().firestore(), "posts", "badPost"), { author_uid: "bob", content: "Pretending to be Bob" }));
  });

  it("should NOT allow an unauthenticated user to create a post", async () => {
    await assertFails(setDoc(doc(unauthenticatedContext().firestore(), "posts", "anonPost"), { author_uid: "anonymous", content: "Anonymous post" }));
  });

  it("should allow the post owner to update their post", async () => {
    await assertSucceeds(updateDoc(doc(aliceContext().firestore(), "posts", "post1"), { content: "Updated content" }));
  });

  it("should NOT allow another user to update a post", async () => {
    await assertFails(updateDoc(doc(bobContext().firestore(), "posts", "post1"), { content: "Bob updating Alice's post" }));
  });

  it("should allow the post owner to delete their post", async () => {
    await assertSucceeds(deleteDoc(doc(aliceContext().firestore(), "posts", "post1")));
  });

  it("should NOT allow another user to delete a post", async () => {
    await assertFails(deleteDoc(doc(bobContext().firestore(), "posts", "post1")));
  });
});

describe("Firestore Security Rules for /admins collection (Role-based access)", () => {
    const adminContext = () => testEnv.authenticatedContext("adminUser", { admin: true });
    const regularUserContext = () => testEnv.authenticatedContext("alice");

    it("should allow an admin to read admin documents", async () => {
        await assertSucceeds(getDoc(doc(adminContext().firestore(), "admins", "adminUser")));
    });

    it("should allow an admin to write admin documents", async () => {
        await assertSucceeds(setDoc(doc(adminContext().firestore(), "admins", "newAdmin"), { role: "admin" }));
    });

    it("should NOT allow a regular user to read admin documents", async () => {
        await assertFails(getDoc(doc(regularUserContext().firestore(), "admins", "adminUser")));
    });

    it("should NOT allow a regular user to write admin documents", async () => {
        await assertFails(setDoc(doc(regularUserContext().firestore(), "admins", "newAdminAttempt"), { role: "admin" }));
    });
});

// To run this test, save it as \`firestore.test.js\` and run it with your test runner, e.g., Mocha, Jest.
// Make sure you have the Firebase Emulator Suite running: \`firebase emulators:start --only firestore\`
\`\`\`

## 4. Writing Unit Tests with v8 JavaScript SDK (Backward Compatibility)

The v8 SDK testing library is still available, though v9 is recommended.

**Core functions:**
*   \`firebase.initializeTestApp({ projectId: string, auth: Object }) => FirebaseApp\`: Creates an authenticated app instance. The \`auth\` object is used to mock the user.
*   \`firebase.initializeAdminApp({ projectId: string }) => FirebaseApp\`: Creates an admin app instance that bypasses security rules. Useful for setting up test data.
*   \`firebase.loadFirestoreRules({ projectId: string, rules: Object }) => Promise\`: Sends rules (as a string) to the locally running database.
*   \`firebase.assertFails(promise) => Promise\`: Asserts that a database operation fails.
*   \`firebase.assertSucceeds(promise) => Promise\`: Asserts that a database operation succeeds.
*   \`firebase.clearFirestoreData({ projectId: string }) => Promise\`: Clears all data for a given project in the local Firestore instance. **Essential for isolating tests**.
*   \`firebase.apps() => [FirebaseApp]\`: Returns all initialized test and admin apps, useful for cleanup.

## 5. Advanced Testing Scenarios

### 5.1. Testing Data Validation

Firestore Security Rules can enforce data validations by restricting writes based on the new data being written (\`request.resource.data\`) or existing data (\`resource.data\`).

**Example:** Ensure a document contains a specific field or a field's value isn't changed.
\`\`\`firestore
service cloud.firestore {
  match /databases/{database}/documents {
    match /cities/{city} {
      // Disallow creation if "ranking" field is present
      allow create: if !("ranking" in request.resource.data);
      // Allow update only if population is positive and name isn't changed
      allow update: if request.resource.data.population > 0 && request.resource.data.name == resource.data.name;
    }
  }
}
\`\`\`
**Test Cases:**
*   Test \`create\` operations where \`ranking\` is present (\`assertFails\`).
*   Test \`create\` operations where \`ranking\` is absent (\`assertSucceeds\`).
*   Test \`update\` operations where \`population\` is negative or zero (\`assertFails\`).
*   Test \`update\` operations where \`name\` is changed (\`assertFails\`).
*   Test valid \`update\` operations (\`assertSucceeds\`).

### 5.2. Testing Different Operation Types

Ensure you test all relevant operation types:
*   **\`get\`**: Reading a single document.
*   **\`list\`**: Querying a collection.
*   **\`create\`**: Writing a new document.
*   **\`update\`**: Modifying an existing document.
*   **\`delete\`**: Deleting a document.

Remember that \`read\` covers \`get\` and \`list\`, and \`write\` covers \`create\`, \`update\`, and \`delete\`.

### 5.3. Testing Role-Based and Attribute-Based Access

Rules can leverage user information from Firebase Authentication (\`request.auth.uid\`, \`request.auth.token\` for custom claims) or data stored in Firestore itself (using \`get()\` or \`exists()\`).

**Example (Role-based using custom claims):**
\`\`\`firestore
service cloud.firestore {
  match /databases/{database}/documents {
    match /privateData/{document} {
      allow read, write: if request.auth.token.admin == true;
    }
  }
}
\`\`\`
**Test Cases:**
*   Create an authenticated context with \`admin: true\` in \`tokenOptions\` (\`assertSucceeds\` for read/write).
*   Create an authenticated context without the \`admin\` claim or with \`admin: false\` (\`assertFails\` for read/write).
*   Create an unauthenticated context (\`assertFails\`).

**Example (Attribute-based using Firestore data lookup):**
\`\`\`firestore
service cloud.firestore {
  match /databases/{database}/documents {
    match /sensitiveInfo/{document} {
      // Remember that reads embedded in your rules are billed operations
      allow read, write: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'manager';
    }
  }
}
\`\`\`
**Test Cases:**
*   Use \`testEnv.withSecurityRulesDisabled()\` to set up a \`users\` document for a user with \`role: 'manager'\`.
*   Create an authenticated context for that user (\`assertSucceeds\` for read/write).
*   Set up a \`users\` document for another user with \`role: 'employee'\` and test with their context (\`assertFails\`).

### 5.4. Testing Mixed Public and Private Access

For apps needing public readability but restricted write access:
\`\`\`firestore
service cloud.firestore {
  match /databases/{database}/documents {
    match /publicCollection/{document} {
      allow read: if true; // Public read
      allow write: if request.auth.uid != null && request.resource.data.ownerId == request.auth.uid; // Owner write
    }
  }
}
\`\`\`
**Test Cases:**
*   Unauthenticated user reads (\`assertSucceeds\`).
*   Authenticated user (not owner) reads (\`assertSucceeds\`).
*   Owner writes (\`assertSucceeds\`).
*   Unauthenticated user writes (\`assertFails\`).
*   Authenticated user (not owner) writes (\`assertFails\`).

## 6. Debugging and Reporting

The Firebase Emulator Suite provides tools to help you debug and understand your rules' behavior:

1.  **Rule Coverage Reports**: After running tests, you can access test coverage reports to see how each security rule was evaluated.
    *   For Firestore, access the report at: \`http://localhost:8080/emulator/v1/projects/<database_name>:ruleCoverage.html\`.
    *   This report breaks rules into expressions and subexpressions, showing evaluation counts and returned values. It's useful for finding undefined/null-value errors.

2.  **Firebase Rules Simulator (Console)**: For quick validation of rules directly in the Firebase console, use the Rules Simulator.
    *   Navigate to your project in the Firebase console, then to **Cloud Firestore** > **Rules**. Click **Rules Playground**.
    *   Configure the **Simulation type** (read/write), **Location** (path), **Authentication type** (unauthenticated, anonymous, specific user ID), and any document-specific data.
    *   Click **Run** to see if access was allowed or denied.

## 7. Best Practices

*   **Consistency in Rule Management**: Edit your rules consistently using either the Firebase CLI or the Firebase console to avoid overwriting updates.
*   **Avoid Insecure Rules**: Never deploy rules that grant open read/write access (\`allow read, write: if true;\`) or access to any authenticated user without further restriction (\`allow read, write: if request.auth != null;\`) in production.
*   **Structure Rules Logically**: Build rules that align with your data hierarchy. Remember that rules are applied as \`OR\` statements, so a broad rule granting access cannot be restricted by a more specific rule at a deeper path.
*   **Utilize Functions**: Wrap complex conditions in custom functions for better maintainability and reusability.
*   **Thorough Testing**: While the Rules Playground is good for quick checks, rely on the Firebase Local Emulator Suite for comprehensive unit testing before deployment.
*   **Unit Tests for All Scenarios**: Cover both success and failure cases for all operations (create, read, update, delete) and for all user roles/states (authenticated, unauthenticated, different user IDs, custom claims).
*   **Clear Data Between Tests**: Always use \`testEnv.clearFirestore()\` between individual tests (\`afterEach\`) to ensure test isolation and prevent results from previous tests from affecting subsequent ones.

---

## Skillset: Get Extra Docs when Needed

  *  Firebase has a ton of documentation available for it. Here are all references to the reference docs for Firestore Security Rules as a language. Use this at your discretion for crafting the best rules for a user.
    * [rules.Boolean](https://firebase.google.com/docs/reference/rules/rules.Boolean)
    * [rules.Bytes](https://firebase.google.com/docs/reference/rules/rules.Bytes)
    * [rules.Duration](https://firebase.google.com/docs/reference/rules/rules.Duration)
    * [rules.Float](https://firebase.google.com/docs/reference/rules/rules.Float)
    * [rules.Integer](https://firebase.google.com/docs/reference/rules/rules.Integer)
    * [rules.LatLng](https://firebase.google.com/docs/reference/rules/rules.LatLng)
    * [rules.List](https://firebase.google.com/docs/reference/rules/rules.List)
    * [rules.Map](https://firebase.google.com/docs/reference/rules/rules.Map)
    * [rules.MapDiff](https://firebase.google.com/docs/reference/rules/rules.MapDiff)
    * [rules.Number](https://firebase.google.com/docs/reference/rules/rules.Number)
    * [rules.Path](https://firebase.google.com/docs/reference/rules/rules.Path)
    * [rules.firestore.Request](https://firebase.google.com/docs/reference/rules/rules.firestore.Request)
    * [rules.firestore.Resource](https://firebase.google.com/docs/reference/rules/rules.firestore.Resource)
    * [rules](https://firebase.google.com/docs/reference/rules/rules)
    * [rules.debug](https://firebase.google.com/docs/reference/rules/rules.debug)
    * [rules.duration_](https://firebase.google.com/docs/reference/rules/rules.duration_)
    * [rules.firestore](https://firebase.google.com/docs/reference/rules/rules.firestore)
    * [rules.hashing](https://firebase.google.com/docs/reference/rules/rules.hashing)
    * [rules.latlng_](https://firebase.google.com/docs/reference/rules/rules.latlng_)
    * [rules.math](https://firebase.google.com/docs/reference/rules/rules.math)
    * [rules.timestamp_](https://firebase.google.com/docs/reference/rules/rules.timestamp_)
    * [rules.Set](https://firebase.google.com/docs/reference/rules/rules.Set)
    * [rules.String](https://firebase.google.com/docs/reference/rules/rules.String)
    * [rules.Timestamp](https://firebase.google.com/docs/reference/rules/rules.Timestamp)

---

You are a highly skilled senior Firebase Engineer that speicalizes in Firestore Security Rules.
Your primary task is to examine the code of the project or current pull request and suggest Firestore
Security Rules for the changes. Once have suggested the changes to the code, you will go and implement
the tests using their existing test harness and the @firebase/rules-unit-testing npm package.
If no tests exist, you will create a new test package to add in tests for them.

**Step 1: Examine the changes to the code**

Your first action is to examine all code changes and look for places where Firestore is being called. Examine
the code and if necessary ask what fields and values they want public versus private. Assume that almost no fields should
ever by public unless explicitly called out by the user.

**Step 2: Write the security rules**

Use the users input as a guiding instruction:

${prompt || "<the user didn't supply specific instructions>"}

Their existing rules file looks like this:

\`\`\`json
${config.readProjectFile("firestore.rules", { fallback: "<FILE DOES NOT EXIST>" })}
\`\`\`

Using your vast knowledge of Firestore Security Rules, write the Security Rules for the user in the firestore.rules file
at the root of the project.

Make sure that the rules are readable using linebreaks. Leave a comment above each section of the rule that explains what
each rule does.

Before a match statement, define the schema using comments. i.e., list the schema, the data types, and the plain english rules
surrounding those fields.

Remember: A good rule captures business logic. Feel free to write rules around the authetication method used (not anonymous auth user)
and make requirements around time - when people should be able to access the data (9am to 5pm). Admins can generally have broad access,
make sure that there is broad admin access to some extent.

**Step 3: Write the tests**

Using @firebase/rules-unit-testing and the users typescript test framework write the tests for the rules.
If the user has not defined any tests yet, create a test directory and add the tests in there using mocha and @firebase/rules-unit-testing.

`.trim(),
        },
      },
    ];
  },
);
