# Firestore Web SDK Usage Guide

This guide focuses on the **Modular Web SDK** (v9+), which is tree-shakeable and efficient.

## Initialization

```javascript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// If running in Firebase App Hosting, you can skip Firebase Config and instead use:
// const app = initializeApp();

const firebaseConfig = {
  // Your config options. Get the values by running 'firebase apps:sdkconfig <platform> <app-id>'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

```

## Writing Data

### Set a Document (`setDoc`)
Creates a document if it doesn't exist, or overwrites it if it does.

```javascript
import { doc, setDoc } from "firebase/firestore"; 

// Create/Overwrite document with ID "LA"
await setDoc(doc(db, "cities", "LA"), {
  name: "Los Angeles",
  state: "CA",
  country: "USA"
});

// To merge with existing data instead of overwriting:
await setDoc(doc(db, "cities", "LA"), { population: 3900000 }, { merge: true });
```

### Add a Document with Auto-ID (`addDoc`)
Use when you don't care about the document ID.

```javascript
import { collection, addDoc } from "firebase/firestore"; 

const docRef = await addDoc(collection(db, "cities"), {
  name: "Tokyo",
  country: "Japan"
});
console.log("Document written with ID: ", docRef.id);
```

### Update a Document (`updateDoc`)
Update some fields of an existing document without overwriting the entire document. Fails if the document doesn't exist.

```javascript
import { doc, updateDoc } from "firebase/firestore";

const laRef = doc(db, "cities", "LA");

await updateDoc(laRef, {
  capital: true
});
```

### Transactions
Perform an atomic read-modify-write operation.

```javascript
import { runTransaction, doc } from "firebase/firestore";

const sfDocRef = doc(db, "cities", "SF");

try {
  await runTransaction(db, async (transaction) => {
    const sfDoc = await transaction.get(sfDocRef);
    if (!sfDoc.exists()) {
      throw "Document does not exist!";
    }

    const newPopulation = sfDoc.data().population + 1;
    transaction.update(sfDocRef, { population: newPopulation });
  });
  console.log("Transaction successfully committed!");
} catch (e) {
  console.log("Transaction failed: ", e);
}
```

## Reading Data

### Get a Single Document (`getDoc`)

```javascript
import { doc, getDoc } from "firebase/firestore";

const docRef = doc(db, "cities", "SF");
const docSnap = await getDoc(docRef);

if (docSnap.exists()) {
  console.log("Document data:", docSnap.data());
} else {
  console.log("No such document!");
}
```

### Get Multiple Documents (`getDocs`)
Fetches all documents in a query or collection once.

```javascript
import { collection, getDocs } from "firebase/firestore";

const querySnapshot = await getDocs(collection(db, "cities"));
querySnapshot.forEach((doc) => {
  // doc.data() is never undefined for query doc snapshots
  console.log(doc.id, " => ", doc.data());
});
```

## Realtime Updates

### Listen to a Document/Query (`onSnapshot`)

```javascript
import { doc, onSnapshot } from "firebase/firestore";

const unsub = onSnapshot(doc(db, "cities", "SF"), (doc) => {
    console.log("Current data: ", doc.data());
});

// Stop listening
// unsub();
```

### Handle Changes (Added/Modified/Removed)

```javascript
import { collection, query, where, onSnapshot } from "firebase/firestore";

const q = query(collection(db, "cities"), where("state", "==", "CA"));
const unsubscribe = onSnapshot(q, (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === "added") {
        console.log("New city: ", change.doc.data());
    }
    if (change.type === "modified") {
        console.log("Modified city: ", change.doc.data());
    }
    if (change.type === "removed") {
        console.log("Removed city: ", change.doc.data());
    }
  });
});
```

## Queries

### Simple and Compound Queries
Use `query()` to combine filters.

```javascript
import { collection, query, where, getDocs } from "firebase/firestore";

const citiesRef = collection(db, "cities");

// Simple equality
const q1 = query(citiesRef, where("state", "==", "CA"));

// Compound (AND)
// Note: Requires an index if filtering on different fields
const q2 = query(citiesRef, where("state", "==", "CA"), where("population", ">", 1000000));
```

### Order and Limit
Sort and limit results.

```javascript
import { orderBy, limit } from "firebase/firestore";

const q = query(citiesRef, orderBy("name"), limit(3));
```
