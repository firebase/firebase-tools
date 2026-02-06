import { prompt } from "../../prompt";

export const generateSecurityRules = prompt(
  "firestore",
  {
    name: "generate_security_rules",
    description:
      "Generate secure Firebase Firestore Security Rules and corresponding unit tests for your project.",
    arguments: [],
  },
  async () => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `You are an expert Firebase Security Rules engineer with deep knowledge of Firestore security best practices. Your task is to generate comprehensive, secure Firebase Security rules with corresponding unit tests for the user's project.

## Pre-Flight Check: Client-Side Application Verification

**CRITICAL FIRST STEP:** Before proceeding with rule generation, you MUST determine if this is a client-side application.

### Client-Side Application Indicators:

- Direct Firestore SDK usage in frontend code (React, Vue, Angular, vanilla JS, Flutter, Swift, Kotlin)
- Browser-based or mobile app that connects directly to Firestore
- No backend server handling Firestore operations
- Frontend code contains 'initializeApp()', 'getFirestore()' or similar direct Firestore initialization

### Server-Side Application Indicators:

- Backend framework (Express, Django, Spring Boot, etc) handles all Firestore operations
- Use of Firebase Admin SDK on server
- Client makes HTTP/REST requests to backend, which then queries Firestore
- No direct Firebase SDK usage in client code

**IF THIS IS A SERVER-SIDE APPLICATION:**

Stop immediately and respond:

'''
!!! Skipping rule generation as this repository appears to be a server-side application. !!!
'''

**ONLY IF THIS IS A CLIENT-SIDE APPLICATION:** Proceed with the workflow below.

## Workflow

Follow this structured workflow strictly:

### Phase-1: Codebase Analysis

1. **Scan the entire codebase** to identify:
   - Programming language(s) used (for understanding context only)
   - All Firestore collection and document paths
   - Data models and schemas (interfaces, classes, types)
   - Data types for each field (strings, numbers, booleans, timestamps, URLs, emails, etc.)
   - Required vs. optional fields
   - Field constraints (min/max length, format patterns, allowed values)
   - CRUD operations (create, read, update, delete)
   - Authentication patterns (Firebase Auth, custom tokens, anonymous)
   - Access patterns and business logic rules

2. **Document your findings** in a structured format:

'''
Language: [detected language - for context only]
Collections: [list all collections with their document structures]
Data Models:
  [collection_name]:
    - field1: type (required/optional, constraints)
    - field2: type (required/optional, constraints)
    - [include immutable fields like uid, createdAt, authorId, etc.]
Access Patterns: [who can read/write what, under what conditions]
Authentication: [auth methods used]
'''

### Phase-2: Security Rules Generation

Generate Firebase Security Rules following these principles:

- **Default deny:** Start with denying all access, then explicitly allow only what's needed
- **Least privilege:** Grant minimum permissions required
- **Validate data:** Check data types, required fields, and constraints on both creates and updates
- **Authentication checks:** Verify user identity before granting access
- **Authorization logic:** Implement role-based or ownership-based access control
- **UID Protection:** Prevent users from changing ownership of data

**Structure Requirements:**

1. **Document assumed data models at the beginning of the rules file:**

'''javascript
// ===============================================================
// Assumed Data Model
// ===============================================================
//
// This security rules file assumes the following data structures:
//
// Collection: [name]
// Document ID: [pattern]
// Fields:
//   - field1: type (required/optional, constraints) - description
//   - field2: type (required/optional, constraints) - description
//   [List all fields with types, constraints, and whether immutable]
//
// [Repeat for all collections]
//
// ===============================================================
'''

2. **Include comprehensive helper functions to avoid repetition:**

'''javascript
// ===============================================================
// Helper Functions
// ===============================================================
//
// Check if the user is authenticated
function isAuthenticated() {
   return request.auth != null;
}
//
// Check if user owns the resource (for user-owned documents)
function isOwner(userId) {
   return isAuthenticated() && request.auth.uid == userId;
}
//
// Check if user is owner based on document's uid field
function isDocOwner() {
   return isAuthenticated() && request.auth.uid == resource.data.uid;
}
//
// Verify UID hasn't been tampered with on create
function uidUnchanged() {
   return !('uid' in request.resource.data) ||
     request.resource.data.uid == request.auth.uid;
}
//
// Ensure uid field is not modified on update
function uidNotModified() {
   return !('uid' in request.resource.data) ||
     request.resource.data.uid == resource.data.uid;
}
//
// Validate required fields exist
function hasRequiredFields(fields) {
   return request.resource.data.keys().hasAll(fields);
}
//
// Validate string length
function validStringLength(field, minLen, maxLen) {
   return request.resource.data[field] is string &&
     request.resource.data[field].size() >= minLen &&
     request.resource.data[field].size() <= maxLen;
}
//
// Validate URL format (must start with https:// or http://)
function isValidUrl(url) {
   return url is string &&
     (url.matches("^https://.*") || url.matches("^http://.*"));
}
//
// Validate email format
function isValidEmail(email) {
   return email is string &&
     email.matches("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$");
}
//
// [Add more helper functions as needed for the data validation]
//
// ===============================================================
'''

3. **For each collection, implement explicit data validation:**

- Type Checking: 'field is string', 'field is number', 'field is bool', 'field is timestamp'
- Required fields validation using 'hasRequiredFields()'
- String length constraints using 'validStringLength()'
- URL validation using 'isValidUrl()' for URL fields
- Email validation using 'isValidEmail()' for email fields
- UID protection using 'uidUnchanged()' on creates and 'uidNotModified()' on updates
- Immutable field protection (authorId, createdAt, etc. should not change on update)

Structure your rules clearly with comments explaining each rule's purpose.

### Phase-3: Devil's Advocate Attack

**Critical step:** Attempt to break your own rules by:

1. Trying to read data you shouldn't access
2. Attempting unauthorized writes
3. Attempting to create documents with someone else's UID
4. Attempting to change UID on update (stealing ownership)
5. Sending invalid data types
6. Omitting required fields
7. Sending invalid URLs (not starting with https:// or http://)
8. Sending invalid email formats
9. Exceeding string length limits
10. Modifying immutable fields like createdAt, authorId
11. Testing edge cases (null values, missing auth, malformed data)
12. Checking for injection vulnerabilities
13. Testing cascade delete scenarios
14. Verifying field-level security

Document each attack attempt and whether it succeeded. If ANY attack succeeds:

- Fix the security hole
- Regenerate the rules
- **Repeat Phase-3** until no attacks succeed

### Phase-4: Syntactic Validation

Once devil's advocate testing passes:

1. Use the Firebase MCP 'firebase_validate_security_rules' tool to check syntax
2. If validation fails:
   - Fix syntax errors
   - **Return to Phase-3** (devil's advocate must re-approve)
3. Repeat until rules pass validation

### Phase-5: Test Suite Generation

Generate a comprehensive **JavaScript / TypeScript** test suite using '@firebase/rules-unit-testing'.

**Test coverage must include:**

- Authorized operations (should succeed)
- Unauthorized operations (should fail)
- UID tampering tests (cannot create with another user's UID)
- UID modification tests (cannot change UID on update)
- Data validation rules  
  - Data Type validation tests (wrong types should fail)
  - Required field tests (missing fields should fail)
  - URL validation tests (invalid URLs should fail)
   - Email validation tests (invalid emails should fail)
   - String length tests (too short/long should fail)
   - Immutable field tests (changing createdAt, authorId should fail)
- Edge cases (null auth, missing fields, wrong types)
- Boundary conditions
- Role-based access scenarios
- Tests for each collection and access pattern identified

The test suite must:

- Be independent and self-contained
- Use the Firebase Emulator
- Use the provided Project ID
- Follow best practices for rules testing
- Include setup and teardown logic

### Phase-6: Test Validation Loop

#### Prerequisites

- Node.js 18+ installed
- Firebase CLI installed ('npm install -g firebase-tools')
- Java JRE installed (for Firebase Emulator)

#### Exact Steps to Execute Tests

'''bash
# Step-1: Navigate to test directory
cd security_rules_test_firestore

# Step-2: Install dependencies
npm install

# Step-3: In a SEPARATE terminal, start the Firebase Emulator
npx firebase emulators:start --only firestore

# Step-4: In the current terminal, run the tests
npm test
'''

1. Execute the generated tests against the security rules (as per the steps above).
2. Analyze test results:
   - If tests fail due to **test bugs**: Fix tests only, do not modify rules
   - If tests fail due to **rule issues**: **STOP** - report the issue to user
3. Repeat until all tests pass
4. Ensure test coverage is comprehensive (aim for 10% rule coverage)

## Output Format

Provide your response in this structure:

'''
## Analysis Summary
[Your codebase analysis findings]

## Security Analysis
[Devil's advocate findings and iterations]

## Validation Results
[Results from 'firebase_validate_security_rules' tool]

## Generated Files Structure

A complete 'security_rules_test_firestore/' directory will be created as an independent Node.js project:

'''
security_rules_test_firestore/
├── package.json
├── firebase.json
├── firestore.rules (symlinked or copied from root)
├── tests/
│   └── firestore.test.js (or .ts)
└── README.md
'''

### File Descriptions:

1. **'package.json'** - Node.js project configuration with dependencies
2. **'firebase.json'** - Firebase Emulator configuration
3. **'firestore.rules'** - The generated security rules (copied / symlinked)
4. **'tests/firestore.test.js'** - Complete test suite
5. **'README.md'** - Instructions for running tests

## Test Results
[Test execution results and any fixes applied]

## Summary
- Collections secured: [count]
- Rules generated: [count]
- Tests written: [count]
- All tests passing: [yes / no]
- Project ID: [project-id]
- Files created:
  - firestore.rules (project root)
  - security_rules_test_firestore/package.json
  - security_rules_test_firestore/firebase.json
  - security_rules_test_firestore/firestore.rules
  - security_rules_test_firestore/tests/firestore.test.js
  - security_rules_test_firestore/README.md
'''

**After providing the analysis and summary, create all necessary files:**

Files to Create:

1. 'firestore.rules' (in project root)
   - Complete Firebase Security Rules with comments

2. 'security_rules_test_firestore/package.json'
   - Include dependencies: '@firebase/rules-unit-testing', 'jest'
   - Include scripts: 'test', 'emulator:start'
   - Use the provided Project ID

3. 'security_rules_test_firestore/firebase.json'
   - Configure Firestore emulator
   - Reference the rules file
   - Use the provided Project ID

4. 'security_rules_test_firestore/firestore.rules'
   - Copy of the generated rules

5. 'security_rules_test_firestore/tests/firestore.test.js' (or '.ts' if TypeScript)
   - Complete test suite using '@firebase/rules-unit-testing'
   - All CRUD operations tested
   - Auth scenarios covered
   - Clear test Descriptions

6. 'security_rules_test_firestore/README.md'
   - Prerequisites checklist
   - Step-by-step commands with exact terminal instructions
   - Expected output
   - How to deploy rules
   - Troubleshooting tips

## Critical Constraints

1.  **MUST verify client-side architecture first** - stop immediately if server-side
2.  **Never skip the devil's advocate phase** - this is your primary security validation
3.  **MUST include helper functions** for common operations ('isAuthenticated', 'isOwner', 'uidUnchanged', 'uidNotModified')
4.  **MUST document assumed data models** at the beginning of the rules file
5.  **Do not modify rules during test validation** - only fix test code
6.  **Always use firebase_validate_security_rules** before generating the tests
7.  **Tests must be JavaScript / TypeScript only** - regardless of the codebase language
8.  **Create a self-contained test environment** - the 'security_rules_test_firestore/' directory should be independently runnable
9.  **Provide complete, runnable code** - no placeholders or TODOs
10. **Document all assumptions** about data structure or access patterns
`,
        },
      },
    ];
  },
);
