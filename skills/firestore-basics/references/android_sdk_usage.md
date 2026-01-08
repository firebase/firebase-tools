# Firestore Android SDK Usage Guide

This guide uses **Kotlin** and **KTX extensions**, which correspond to the modern Android development standards.

## Initialization

```kotlin
// In your Activity or Application class
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.ktx.Firebase

val db = Firebase.firestore

// Connect to Emulator
// Use 10.0.2.2 to access localhost from the Android Emulator
if (BuildConfig.DEBUG) {
    db.useEmulator("10.0.2.2", 8080)
}
```

## Writing Data

### Set a Document (`set`)
Creates or overwrites a document.

```kotlin
val city = hashMapOf(
    "name" to "Los Angeles",
    "state" to "CA",
    "country" to "USA"
)

db.collection("cities").document("LA")
    .set(city)
    .addOnSuccessListener { Log.d(TAG, "DocumentSnapshot successfully written!") }
    .addOnFailureListener { e -> Log.w(TAG, "Error writing document", e) }

// Merge
db.collection("cities").document("LA")
    .set(mapOf("population" to 3900000), SetOptions.merge())
```

### Add a Document with Auto-ID (`add`)

```kotlin
val data = hashMapOf(
    "name" to "Tokyo",
    "country" to "Japan"
)

db.collection("cities")
    .add(data)
    .addOnSuccessListener { documentReference ->
        Log.d(TAG, "DocumentSnapshot written with ID: ${documentReference.id}")
    }
```

### Update a Document (`update`)

```kotlin
val laRef = db.collection("cities").document("LA")

laRef.update("capital", true)
    .addOnSuccessListener { Log.d(TAG, "DocumentSnapshot successfully updated!") }
```

### Transactions
Atomic read-modify-write.

```kotlin
db.runTransaction { transaction ->
    val sfDocRef = db.collection("cities").document("SF")
    val snapshot = transaction.get(sfDocRef)
    
    // Note: You can also use FieldValue.increment() for simple counters
    val newPopulation = snapshot.getDouble("population")!! + 1
    transaction.update(sfDocRef, "population", newPopulation)
    
    // Success
    null
}.addOnSuccessListener { Log.d(TAG, "Transaction success!") }
 .addOnFailureListener { e -> Log.w(TAG, "Transaction failure.", e) }
```

## Reading Data

### Get a Single Document (`get`)

```kotlin
val docRef = db.collection("cities").document("SF")

docRef.get().addOnSuccessListener { document ->
    if (document != null && document.exists()) {
        Log.d(TAG, "DocumentSnapshot data: ${document.data}")
    } else {
        Log.d(TAG, "No such document")
    }
}
```

### Get Multiple Documents (`get`)

```kotlin
db.collection("cities")
    .get()
    .addOnSuccessListener { result ->
        for (document in result) {
            Log.d(TAG, "${document.id} => ${document.data}")
        }
    }
```

## Realtime Updates

### Listen to Changes (`addSnapshotListener`)

```kotlin
val docRef = db.collection("cities").document("SF")

docRef.addSnapshotListener { snapshot, e ->
    if (e != null) {
        Log.w(TAG, "Listen failed.", e)
        return@addSnapshotListener
    }

    if (snapshot != null && snapshot.exists()) {
        val source = if (snapshot.metadata.hasPendingWrites()) "Local" else "Server"
        Log.d(TAG, "$source data: ${snapshot.data}")
    } else {
        Log.d(TAG, "Current data: null")
    }
}
```

## Queries

### Simple and Compound
Note: Compound queries on different fields require an index.

```kotlin
// Simple
db.collection("cities").whereEqualTo("state", "CA")

// Compound (AND)
db.collection("cities")
    .whereEqualTo("state", "CA")
    .whereGreaterThan("population", 1000000)
```

### Order and Limit

```kotlin
db.collection("cities")
    .orderBy("name", Query.Direction.KEY_ASCENDING)
    .limit(3)
```
