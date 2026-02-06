# SDK Reference

## Contents
- [SDK Generation](#sdk-generation)
- [Web SDK](#web-sdk)
- [Android SDK](#android-sdk)
- [iOS SDK](#ios-sdk)
- [Flutter SDK](#flutter-sdk)
- [Admin SDK](#admin-sdk)

---

## SDK Generation

Configure SDK generation in `connector.yaml`:

```yaml
connectorId: my-connector
generate:
  javascriptSdk:
    outputDir: "../web-app/src/lib/dataconnect"
    package: "@movie-app/dataconnect"
  kotlinSdk:
    outputDir: "../android-app/app/src/main/kotlin/com/example/dataconnect"
    package: "com.example.dataconnect"
  swiftSdk:
    outputDir: "../ios-app/DataConnect"
  dartSdk:
    outputDir: "../flutter-app/lib/dataconnect"
    package: movie_app_dataconnect
```

Generate SDKs:
```bash
firebase dataconnect:sdk:generate
```

---

## Web SDK

### Installation

```bash
npm install firebase
```

### Initialization

```typescript
import { initializeApp } from 'firebase/app';
import { getDataConnect, connectDataConnectEmulator } from 'firebase/data-connect';
import { connectorConfig } from '@movie-app/dataconnect';

const app = initializeApp(firebaseConfig);
const dc = getDataConnect(app, connectorConfig);

// For local development
if (import.meta.env.DEV) {
  connectDataConnectEmulator(dc, 'localhost', 9399);
}
```

### Calling Operations

```typescript
// Generated SDK provides typed functions
import { listMovies, createMovie, getMovie } from '@movie-app/dataconnect';

// Query
const result = await listMovies();
console.log(result.data.movies);

// Query with variables
const movie = await getMovie({ id: 'uuid-here' });

// Mutation
const newMovie = await createMovie({ 
  title: 'New Movie', 
  genre: 'Action' 
});
console.log(newMovie.data.movie_insert); // Returns key
```

### Subscriptions

```typescript
import { listMoviesRef, subscribe } from '@movie-app/dataconnect';

const unsubscribe = subscribe(listMoviesRef(), {
  onNext: (result) => {
    console.log('Movies updated:', result.data.movies);
  },
  onError: (error) => {
    console.error('Subscription error:', error);
  }
});

// Later: unsubscribe();
```

### With Authentication

```typescript
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const auth = getAuth(app);
await signInWithEmailAndPassword(auth, email, password);

// SDK automatically includes auth token in requests
const myReviews = await myReviews(); // @auth(level: USER) query from examples.md
```

---

## Android SDK

### Dependencies (build.gradle.kts)

```kotlin
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.0.0"))
    implementation("com.google.firebase:firebase-dataconnect")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-core:1.6.0")
}
```

### Initialization

```kotlin
import com.google.firebase.Firebase
import com.google.firebase.dataconnect.dataConnect
import com.example.dataconnect.MyConnector

val connector = MyConnector.instance

// For emulator
connector.dataConnect.useEmulator("10.0.2.2", 9399)
```

### Calling Operations

```kotlin
// Query
val result = connector.listMovies.execute()
result.data.movies.forEach { movie ->
    println(movie.title)
}

// Query with variables
val movie = connector.getMovie.execute(id = "uuid-here")

// Mutation
val newMovie = connector.createMovie.execute(
    title = "New Movie",
    genre = "Action"
)
```

### Flow Subscription

```kotlin
connector.listMovies.flow().collect { result ->
    when (result) {
        is DataConnectResult.Success -> updateUI(result.data.movies)
        is DataConnectResult.Error -> showError(result.exception)
    }
}
```

---

## iOS SDK

### Dependencies (Package.swift or SPM)

```swift
dependencies: [
    .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0")
]
// Add FirebaseDataConnect to target dependencies
```

### Initialization

```swift
import FirebaseCore
import FirebaseDataConnect

FirebaseApp.configure()
let connector = MyConnector.shared

// For emulator
connector.useEmulator(host: "localhost", port: 9399)
```

### Calling Operations

```swift
// Query
let result = try await connector.listMovies.execute()
for movie in result.data.movies {
    print(movie.title)
}

// Query with variables
let movie = try await connector.getMovie.execute(id: "uuid-here")

// Mutation
let newMovie = try await connector.createMovie.execute(
    title: "New Movie",
    genre: "Action"
)
```

### Combine Publisher

```swift
connector.listMovies.publisher
    .sink(
        receiveCompletion: { completion in
            if case .failure(let error) = completion {
                print("Error: \(error)")
            }
        },
        receiveValue: { result in
            self.movies = result.data.movies
        }
    )
    .store(in: &cancellables)
```

---

## Flutter SDK

### Dependencies (pubspec.yaml)

```yaml
dependencies:
  firebase_core: ^3.0.0
  firebase_data_connect: ^0.1.0
  movie_app_dataconnect:
    path: ./lib/dataconnect
```

### Initialization

```dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_data_connect/firebase_data_connect.dart';
import 'package:movie_app_dataconnect/movie_app_dataconnect.dart';

await Firebase.initializeApp();
final connector = MyConnector.instance;

// For emulator
connector.dataConnect.useDataConnectEmulator('localhost', 9399);
```

### Calling Operations

```dart
// Query
final result = await connector.listMovies.execute();
for (final movie in result.data.movies) {
  print(movie.title);
}

// Query with variables  
final movie = await connector.getMovie(id: 'uuid-here').execute();

// Mutation
final newMovie = await connector.createMovie(
  title: 'New Movie',
  genre: 'Action',
).execute();
```

### Stream Subscription

```dart
connector.listMovies.subscribe().listen((result) {
  setState(() {
    movies = result.data.movies;
  });
});
```

---

## Admin SDK

Server-side operations with elevated privileges (bypasses @auth):

### Node.js

```typescript
import { initializeApp, cert } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';

initializeApp({
  credential: cert(serviceAccount)
});

const dc = getDataConnect();

// Execute operations (bypasses @auth)
const result = await dc.executeGraphql({
  query: `query { users { id email } }`,
  operationName: 'ListAllUsers'
});

// Or use generated Admin SDK
import { listAllUsers } from './admin-connector';
const users = await listAllUsers();
```

### Generate Admin SDK

In `connector.yaml`:

```yaml
generate:
  nodeAdminSdk:
    outputDir: "./admin-sdk"
    package: "@app/admin-dataconnect"
```

Generate:
```bash
firebase dataconnect:sdk:generate
```
