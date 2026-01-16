import { prompt } from "../../prompt";

export const generateSecurityRules = prompt(
  "storage",
  {
    name: "generate_security_rules",
    description:
      "Generate secure Firebase Storage Security Rules and corresponding unit tests for your project.",
    arguments: [],
  },
  async () => {
    return [
      {
        role: "user" as const,
        content: {
          type: "text",
          text: `You are an expert Firebase Security Rules engineer with deep knowledge of Firebase Storage security best practices. Your task is to generate comprehensive, secure Firebase Security rules with corresponding unit tests for the user's project.

## Workflow

Follow this structured workflow strictly:

### Phase-1: Codebase Analysis

1. **Scan the entire codebase** to identify:
   - Programming language(s) used (for understanding context only)
   - All Firebase Storage bucket paths and folder structures
   - File upload/download patterns and locations
   - File types and size constraints (images, videos, documents, etc.)
   - Metadata requirements (contentType, customMetadata, etc.)
   - Authentication patterns (Firebase Auth, custom tokens, anonymous)
   - Access patterns and business logic rules (who can upload/read/delete what files)
   - File naming conventions and path structures

2. **Document your findings** in a structured format:

'''
Language: [detected language - for context only]
Storage Paths: [list all storage paths and their purposes]
File Types: [allowed file types per path]
Size Limits: [file size constraints]
Access Patterns: [who can upload/read/delete what, under what conditions]
Authentication: [auth methods used]
Metadata Requirements: [any custom or required metadata]
'''

### Phase-2: Security Rules Generation

Generate Firebase Security Rules following these principles:

- **Default deny:** Start with denying all access, then explicitly allow only what's needed
- **Least privilege:** Grant minimum permissions required
- **Validate file types:** Check contentType and file extensions
- **Validate file sizes:** Enforce size limits appropriate for file types
- **Authentication checks:** Verify user identity before granting access
- **Authorization logic:** Implement role-based or ownership-based access control
- **Path-based security:** Secure different paths with appropriate rules
- **Metadata validation:** Validate custom metadata if used

Structure your rules clearly with comments explaining each rule's purpose.

### Phase-3: Devil's Advocate Attack

**Critical step:** Attempt to break your own rules by:

1. Trying to upload files to unauthorized paths
2. Attempting to read files you shouldn't access
3. Trying to delete files you don't own
4. Uploading files with wrong types or excessive sizes
5. Testing edge cases (null auth, missing metadata, malformed paths)
6. Attempting path traversal attacks
7. Testing with different authentication states
8. Verifying file overwrite protections

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

- Authorized uploads (should succeed)
- Unauthorized uploads (should fail)
- Authorized reads (should succeed)
- Unauthorized reads (should fail)
- Authorized deletes (should succeed)
- Unauthorized deletes (should fail)
- File type validation tests
- File size validation tests
- Metadata validation tests
- Edge cases (null auth, missing metadata, wrong paths)
- Path traversal attempt tests
- Ownership verification tests

The test suite must:

- Be independent and self-contained
- Use the Firebase Emulator
- Use the provided Project ID and Bucket name
- Follow best practices for Storage rules testing
- Include setup and teardown logic
- Test with mock file data

### Phase-6: Test Validation Loop

1. Start the Firebase Emulator.
2. Run the generated tests against the security rules
3. Analyze test results:
   - If tests fail due to **test bugs**: Fix tests only, do not modify rules
   - If tests fail due to **rule issues**: **STOP** - report the issue to user
4. Repeat until all tests pass
5. Ensure test coverage is comprehensive (aim for 10% rule coverage)

## Output Format

Provide your response in this structure:

'''markdown
## Analysis Summary
[Your codebase analysis findings]

## Security Analysis
[Devil's advocate findings and iterations]

## Validation Results
[Results from 'firebase_validate_security_rules' tool]

## Generated Files Structure

A complete 'security_rules_test_storage/' directory will be created as an independent Node.js project:

'
security_rules_test_storage/
├── package.json
├── firebase.json
├── storage.rules (symlinked or copied from root)
├── tests/
│   └── storage.test.js (or .ts)
├── test-files/
│   └── [mock files for testing]
└── README.md
'

### File Descriptions:

1. **'package.json'** - Node.js project configuration with dependencies
2. **'firebase.json'** - Firebase Emulator configuration for Firebase Storage
3. **'storage.rules'** - The generated security rules (copied / symlinked)
4. **'tests/storage.test.js'** - Complete test suite
5. **'test-files/'** - Directory containing mock files for testing (images, documents, etc.)
6. **'README.md'** - Instructions for running tests

## Test Results
[Test execution results and any fixes applied]

## Summary
- Storage paths secured: [count]
- Rules generated: [count]
- Tests written: [count]
- All tests passing: [yes / no]
- Project ID: [project-id]
- Bucket: [bucket-name]
- Files created:
  - storage.rules (project root)
  - security_rules_test_storage/package.json
  - security_rules_test_storage/firebase.json
  - security_rules_test_storage/storage.rules
  - security_rules_test_storage/tests/storage.test.js
  - security_rules_test_storage/test-files/[mock files]
  - security_rules_test_storage/README.md

## Setup and Run Instructions

'''bash
# Navigate to test directory
cd security_rules_test_storage

# Install dependencies
npm install

# Start Firebase Emulator and run the tests
npm test
'''

'''

**After providing the analysis and summary, create all necessary files:**

Files to Create:

1. 'storage.rules' (in project root)
   - Complete Firebase Storage Security Rules with comments
   - Fules for all identified storage paths
   - File type and size validations
   - Authentication and authorization logic

2. 'security_rules_test_storage/package.json'
   - Include dependencies: '@firebase/rules-unit-testing', 'jest'
   - Include scripts: 'test', 'emulator:start'
   - Use the provided Project ID and Bucket Name

3. 'security_rules_test_storage/firebase.json'
   - Configure Firebase Storage emulator
   - Reference the rules file
   - Use the provided Project ID and Bucket Name
   - Configure emulator port (default: 9199)

4. 'security_rules_test_storage/storage.rules'
   - Copy of the generated rules

5. 'security_rules_test_storage/tests/storage.test.js' (or '.ts' if TypeScript)
   - Complete test suite using '@firebase/rules-unit-testing'
   - All upload/read/delete operations tested
   - File type validation tests
   - File size validation tests
   - Auth scenarios covered
   - Clear test Descriptions
   - Helper functions for creating mock files

6. 'security_rules_test_storage/test-files/' (directory)
   - Create mock files for testing:
     - 'test-image.jpg' (small valid image)
     - 'test-image-large.jpg' (oversized image for size validation)
     - 'test-document.pdf' (valid document)
     - 'test-invalid.exe' (invalid file type)
   - Or document how to generate these files in tests

7. 'security_rules_test_storage/README.md'
   - Setup instructions
   - How to run tests
   - How to deploy rules
   - Storage bucket configuration notes
   - Troubleshooting tips

## Critical Constraints

1. **Never skip the devil's advocate phase** - this is your primary security validation
2.  **MUST document assumed data models** at the beginning of the rules file
3. **Do not modify rules during test validation** - only fix test code
4. **Always use firebase_validate_security_rules** before generating the tests
5. **Tests must be JavaScript / TypeScript only** - regardless of the codebase language
6. **Create a self-contained test environment** - the 'security_rules_test_storage/' directory should be independently runnable
7. **Provide complete, runnable code** - no placeholders or TODOs
8. **Test with realistic file scenarios** - include various file types and sizes
9. **Document all assumptions** about storage structure, file types, and access patterns

## Storage-Specific Constraints

- **File type validation:** Always validate 'request.resource.contentType'
- **File size limits:** Use 'request.resource.size' to enforce limits
- **Path security:** Use wildcards and variables carefully (e.g. '/users/{userId}/files/{fileName}')
- **Metadata validation:** Validate 'request.resource.metadata' if custom metadata is used
- **Ownership patterns:** Common pattern is '/users/{userId}' where only that user has access
- **Public vs Private:** Clearly distinguish between public-read and private storage paths
- **File extensions:** Validate actual file extension matches declared contentType when possible`,
        },
      },
    ];
  },
);
