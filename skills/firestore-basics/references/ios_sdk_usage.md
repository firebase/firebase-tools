# Firestore iOS SDK Usage Guide

This guide uses **Swift** and the Firebase iOS SDK.

## Initialization

```swift
import FirebaseCore
import FirebaseFirestore

// In your App Delegate or just before using Firestore
FirebaseApp.configure()

let db = Firestore.firestore()

// Connect to Emulator (Localhost)
// iOS Simulator uses 'localhost'
#if DEBUG
let settings = db.settings
settings.host = "127.0.0.1:8080"
settings.cacheSettings = MemoryCacheSettings()
settings.isSSLEnabled = false
db.settings = settings
#endif
```

## Writing Data

### Set a Document (`setData`)
Creates or overwrites a document.

```swift
let city = [
    "name": "Los Angeles",
    "state": "CA",
    "country": "USA"
]

db.collection("cities").document("LA").setData(city) { err in
    if let err = err {
        print("Error writing document: \(err)")
    } else {
        print("Document successfully written!")
    }
}

// Merge
db.collection("cities").document("LA").setData([ "population": 3900000 ], merge: true)
```

### Add a Document with Auto-ID (`addDocument`)

```swift
var ref: DocumentReference? = nil
ref = db.collection("cities").addDocument(data: [
    "name": "Tokyo",
    "country": "Japan"
]) { err in
    if let err = err {
        print("Error adding document: \(err)")
    } else {
        print("Document added with ID: \(ref!.documentID)")
    }
}
```

### Update a Document (`updateData`)

```swift
let laRef = db.collection("cities").document("LA")

laRef.updateData([
    "capital": true
]) { err in
    if let err = err {
        print("Error updating document: \(err)")
    } else {
        print("Document successfully updated")
    }
}
```

### Transactions
Atomic read-modify-write.

```swift
db.runTransaction({ (transaction, errorPointer) -> Any? in
    let sfDocument: DocumentSnapshot
    do {
        try sfDocument = transaction.getDocument(db.collection("cities").document("SF"))
    } catch let fetchError as NSError {
        errorPointer?.pointee = fetchError
        return nil
    }

    guard let oldPopulation = sfDocument.data()?["population"] as? Int else {
        let error = NSError(
            domain: "AppErrorDomain",
            code: -1,
            userInfo: [
                NSLocalizedDescriptionKey: "Unable to retrieve population from snapshot \(sfDocument)"
            ]
        )
        errorPointer?.pointee = error
        return nil
    }

    // Note: You can also use FieldValue.increment(Int64(1))
    transaction.updateData(["population": oldPopulation + 1], forDocument: sfDocument.reference)
    return nil
}) { (object, error) in
    if let error = error {
        print("Transaction failed: \(error)")
    } else {
        print("Transaction successfully committed!")
    }
}
```

## Reading Data

### Get a Single Document (`getDocument`)

```swift
let docRef = db.collection("cities").document("SF")

docRef.getDocument { (document, error) in
    if let document = document, document.exists {
        let dataDescription = document.data().map(String.init(describing:)) ?? "nil"
        print("Document data: \(dataDescription)")
    } else {
        print("Document does not exist")
    }
}
```

### Get Multiple Documents (`getDocuments`)

```swift
db.collection("cities").getDocuments() { (querySnapshot, err) in
    if let err = err {
        print("Error getting documents: \(err)")
    } else {
        for document in querySnapshot!.documents {
            print("\(document.documentID) => \(document.data())")
        }
    }
}
```

## Realtime Updates

### Listen to Changes (`addSnapshotListener`)

```swift
db.collection("cities").document("SF")
    .addSnapshotListener { documentSnapshot, error in
        guard let document = documentSnapshot else {
            print("Error fetching document: \(error!)")
            return
        }
        
        let source = document.metadata.hasPendingWrites ? "Local" : "Server"
        print("\(source) data: \(document.data() ?? [:])")
    }
```

## Queries

### Simple and Compound

```swift
// Simple
db.collection("cities").whereField("state", isEqualTo: "CA")

// Compound (AND)
db.collection("cities")
    .whereField("state", isEqualTo: "CA")
    .whereField("population", isGreaterThan: 1000000)
```

### Order and Limit

```swift
db.collection("cities")
    .order(by: "name")
    .limit(to: 3)
```
