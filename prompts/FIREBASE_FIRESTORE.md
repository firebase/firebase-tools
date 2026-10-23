# Firebase Firestore Context

Always use the latest major/minor Cloud Firestore SDK release when scaffolding new dependencies, and use modern modular APIs.

## Minimum Recommended SDK Versions (All 11 SDKs)

When adding Firestore to a new project, query the live package registry first (`npm view <pkg> version`, `pip index versions <pkg>`, `go list -m -versions cloud.google.com/go/firestore`, `dotnet package search Google.Cloud.Firestore --ExactMatch`, `composer show --all google/cloud-firestore`, `gem list --remote "^google-cloud-firestore$"`, `flutter pub outdated`). If offline, use at least these minimum versions:

| Platform / Language | Package / Artifact | Minimum Version | Coupled Packages & Upgrade Notes |
| :--- | :--- | :--- | :--- |
| **Web / JavaScript** | `firebase` | `^12.12.0` | Use modular `firebase/firestore` imports; never use v8 namespaced `firebase.firestore()` or `-compat`. |
| **Node.js (Admin)** | `firebase-admin` | `^13.8.0` | Use modular `firebase-admin/app` and `firebase-admin/firestore` imports. |
| **Node.js (Server)** | `@google-cloud/firestore` | `^8.3.0` | v8+ requires Node.js `>=18` and adds Enterprise Pipeline support (`@google-cloud/firestore/pipelines`). |
| **Python (Admin)** | `firebase-admin` | `>=7.4.0` | Bundles `google-cloud-firestore`; requires Python `>=3.9`. |
| **Python (Server)** | `google-cloud-firestore` | `>=2.26.0` | Always pass `filter=` keyword arg: `.where(filter=FieldFilter("a", "==", 1))`. |
| **Go** | `cloud.google.com/go/firestore` | `v1.22.0` | Run `go get cloud.google.com/go/firestore@latest && go mod tidy`. |
| **Java (JVM Server)** | `com.google.cloud:google-cloud-firestore` | `3.39.0` | Or `com.google.cloud:libraries-bom` `>=26.79.0` in Maven `pom.xml` / Gradle `build.gradle(.kts)` / `libs.versions.toml`. |
| **Android (Kotlin/Java)** | `com.google.firebase:firebase-firestore` | `26.2.0` (BoM `34.12.0`) | On `firebase-bom >= 34.0.0`, `-ktx` artifacts were removed; use `com.google.firebase:firebase-firestore` with `com.google.firebase.Firebase` and `com.google.firebase.firestore.firestore`. |
| **Apple (iOS/macOS)** | `FirebaseFirestore` (`firebase-ios-sdk`) | `12.12.0` | `FirebaseFirestoreSwift` was merged into `FirebaseFirestore` in `v11.0.0+`; remove separate `FirebaseFirestoreSwift` dependencies and imports across all targets in `Podfile` and `Package.swift`. |
| **.NET (C#)** | `Google.Cloud.Firestore` | `4.2.0` | Upgrade `Google.Cloud.Firestore` and `Google.Cloud.Firestore.V1` together across all `.csproj` and `Directory.Packages.props` files (use `dotnet restore --force-evaluate` if `packages.lock.json` exists). |
| **PHP** | `google/cloud-firestore` | `^2.3.4` (`^1.55.0` on 1.x) | Requires PHP `>=8.1` and `ext-grpc`. |
| **Ruby** | `google-cloud-firestore` | `~> 3.2` (`~> 2.16` on 2.x) | Check both `Gemfile` and any `*.gemspec` (`spec.add_dependency`). |
| **Flutter (Dart)** | `cloud_firestore` | `^6.2.0` | Always upgrade `cloud_firestore` (`^6.2.0`) and `firebase_core` (`^4.6.0`) together (plus any other `firebase_*` plugins in `pubspec.yaml` to matching FlutterFire versions). |

## Existing Projects on Older SDKs (Non-Mutating Turn 1 Rule)

1. **Never Auto-Mutate Manifests or Lockfiles Unprompted:**
   - If the project already declares an older Firestore SDK in `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle(.kts)`, `gradle/libs.versions.toml`, `Podfile`, `Package.swift`, `*.csproj`, `Directory.Packages.props`, `composer.json`, `Gemfile`, `*.gemspec`, or `pubspec.yaml`, **do not edit any manifest or lockfile in Turn 1** unless the user explicitly asked to upgrade.
   - If the SDK is already at or above the minimum version in the table above, do not mention or offer an upgrade.
2. **Deliver Compatible Code First + 1-Line Optional Upgrade Prompt:**
   - Write code that compiles cleanly against the project's currently installed SDK version (for example, keep `com.google.firebase.ktx.Firebase` if the project stays on Android `firebase-bom:32.x`, or keep `import FirebaseFirestoreSwift` if the project stays on iOS `10.x`).
   - **Exception (Feature Requires Newer SDK):** If the user requests a feature that does not exist in their installed SDK—such as **Vector Search (`findNearest`)** (requires Web `>=10.12.0`, Node.js `@google-cloud/firestore >=7.8.0` / `firebase-admin >=12.2.0`, Python `>=2.16.0`, Go `>=v1.15.0`) or **Enterprise Pipelines (`.pipeline()`)** (requires Web `>=12.10.0`, Node.js `@google-cloud/firestore >=8.0.0` / `firebase-admin >=13.6.0`)—write the canonical modern implementation for the requested feature, leave the manifest untouched in Turn 1, and state in your 1-line upgrade prompt that the feature requires upgrading the SDK to compile.
   - End Turn 1 with a concise 1-line offer:
     > *"Note: Your project uses `<package>` `<current_version>`, which is behind `<latest_version>`. Would you like me to upgrade `<package>` to `<latest_version>` (and update any affected code/lockfiles)?"*
3. **When the User Confirms an Upgrade (Turn 2 Verification & Rollback):**
   - Update the manifest (including all coupled packages, BOMs, multi-module files, and lockfiles), migrate any breaking API calls in source files, and run the project's build/dependency check (`npm install` / `npx tsc --noEmit`, `pip install`, `go mod tidy && go build ./...`, `mvn test-compile` / `./gradlew compileJava`, `dotnet build`, `composer update`, `bundle lock`, or `flutter pub get && dart analyze`).
   - Never leave temporary helper scripts or scratch files in the project workspace.
   - If dependency resolution or compilation fails due to host toolchain constraints, immediately revert the manifest/lockfile changes and report the incompatibility.

## Web Modular SDK (`firebase` 12.x+)

Always use tree-shakeable modular imports from `firebase/firestore`. Never use legacy v8 namespaced (`firebase.firestore().collection(...)`) or `-compat` imports for new code.

<example>
```typescript
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  vector,
  findNearest,
} from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Write a document
await setDoc(doc(db, 'users', userId), {
  displayName: 'Ada Lovelace',
  updatedAt: serverTimestamp(),
}, { merge: true });

// Standard query
const q = query(
  collection(db, 'users'),
  where('active', '==', true),
  orderBy('updatedAt', 'desc'),
  limit(20),
);
const snapshot = await getDocs(q);

// Vector Search query (firebase >= 10.12.0, recommended ^12.12.0)
const vectorQuery = findNearest(
  collection(db, 'articles'),
  'embedding',
  vector([0.1, 0.2, 0.3]),
  { limit: 5, distanceMeasure: 'COSINE' },
);
const vectorSnap = await getDocs(vectorQuery);

// Enterprise Pipeline query on Web (Firestore Enterprise edition; firebase ^12.12.0)
import { execute, expressions } from 'firebase/firestore/pipelines';
const { field, countAll } = expressions;

const pipelineSnap = await execute(
  db
    .pipeline()
    .collection('logs')
    .where(field('level').equal('ERROR'))
    .aggregate({
      accumulators: [countAll().as('errorCount')],
      groups: ['service'],
    }),
);
```
</example>

## Server SDKs (Node.js, Python, Go)

<example>
```typescript
// Node.js (firebase-admin ^13.8.0 / @google-cloud/firestore ^8.3.0)
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

// Vector Search (Node.js)
const nearSnap = await db
  .collection('articles')
  .findNearest('embedding', FieldValue.vector([0.1, 0.2, 0.3]), {
    limit: 5,
    distanceMeasure: 'COSINE',
  })
  .get();

// Enterprise Pipeline Query (Firestore Enterprise edition; @google-cloud/firestore ^8.3.0 / firebase-admin ^13.8.0)
import { Expressions } from '@google-cloud/firestore/pipelines';
const { field, countAll } = Expressions;

const pipelineResults = await db
  .pipeline()
  .collection('events')
  .where(field('severity').equal('ERROR'))
  .aggregate({
    accumulators: [countAll().as('errorCount')],
    groups: ['service'],
  })
  .execute();
```
</example>

<example>
```python
# Python (google-cloud-firestore >= 2.26.0 / firebase-admin >= 7.4.0)
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector

db = firestore.Client()

# Always pass the filter= keyword argument to .where()
docs = db.collection("users").where(filter=FieldFilter("active", "==", True)).stream()

# Vector Search (Python)
nearest = (
    db.collection("docs")
    .find_nearest(
        vector_field="embedding",
        query_vector=Vector([0.1, 0.2, 0.3]),
        distance_measure=DistanceMeasure.COSINE,
        limit=5,
    )
    .get()
)
```
</example>

<example>
```go
// Go (cloud.google.com/go/firestore >= v1.22.0)
docs, err := client.Collection("articles").
	FindNearest("embedding", firestore.Vector32(vec), 5, firestore.DistanceMeasureCosine, nil).
	Documents(ctx).
	GetAll()
```
</example>

## Security Rules & Indexes CLI Commands

<example>
```bash
# Start local Firestore emulator
firebase emulators:start --only firestore

# Run test suite against local Firestore emulator
firebase emulators:exec --only firestore "npm test"

# Deploy only Firestore security rules or composite indexes
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```
</example>
