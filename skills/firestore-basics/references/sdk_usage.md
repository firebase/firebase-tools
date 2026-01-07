# Firestore SDK Usage

## Web (Modular SDK)

### Initialization

```javascript
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // Your config options
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
```

### connecting to Emulator

If you are running the local emulator:

```javascript
import { connectFirestoreEmulator } from "firebase/firestore";

// After initializing db
if (location.hostname === "localhost") {
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

### Basic Operations

#### Add Data

```javascript
import { collection, addDoc } from "firebase/firestore"; 

try {
  const docRef = await addDoc(collection(db, "users"), {
    first: "Ada",
    last: "Lovelace",
    born: 1815
  });
  console.log("Document written with ID: ", docRef.id);
} catch (e) {
  console.error("Error adding document: ", e);
}
```

#### Read Data

```javascript
import { collection, getDocs } from "firebase/firestore";

const querySnapshot = await getDocs(collection(db, "users"));
querySnapshot.forEach((doc) => {
  console.log(`${doc.id} => ${doc.data()}`);
});
```

#### Listen for Realtime Updates

```javascript
import { collection, onSnapshot } from "firebase/firestore";

const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
  snapshot.docChanges().forEach((change) => {
    if (change.type === "added") {
       console.log("New user: ", change.doc.data());
    }
  });
});

// To stop listening:
// unsubscribe();
```
