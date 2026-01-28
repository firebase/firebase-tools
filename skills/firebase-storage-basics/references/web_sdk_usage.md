# Cloud Storage for Firebase - Web SDK Usage

This guide covers the basics of using Cloud Storage in a web application using the modular SDK (v9+).

## 1. Initialize Storage

Ensure you have initialized your Firebase app first.

```javascript
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  // Your Firebase app config object. Get this by running 'firebase apps:sdkconfig [options] web [appId]
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
```

## 2. Create a Reference

A reference points to a file or location in your bucket.

```javascript
import { ref } from "firebase/storage";

// Create a child reference
const imagesRef = ref(storage, 'images');

// References can be chained
const spaceRef = ref(storage, 'images/space.jpg');
// OR
const spaceRef2 = ref(imagesRef, 'space.jpg');
```

## 3. Upload a File

Use `uploadBytes` for simple uploads or `uploadBytesResumable` for monitoring progress.

```javascript
import { ref, uploadBytes } from "firebase/storage";

const storageRef = ref(storage, 'some-child');
const file = ... // File object from input element

uploadBytes(storageRef, file).then((snapshot) => {
  console.log('Uploaded a blob or file!');
});
```

### With Metadata

```javascript
const metadata = {
  contentType: 'image/jpeg',
  customMetadata: {
    'uploadedBy': 'user123'
  }
};

uploadBytes(storageRef, file, metadata).then((snapshot) => {
  console.log('Uploaded with metadata');
});
```

## 4. Download a File (Get URL)

To display an image or create a download link, get the download URL.

```javascript
import { ref, getDownloadURL } from "firebase/storage";

getDownloadURL(ref(storage, 'images/stars.jpg'))
  .then((url) => {
    // Insert url into an <img> tag to "download"
    const img = document.getElementById('myimg');
    img.setAttribute('src', url);
  })
  .catch((error) => {
    // Handle any errors
  });
```

## 5. Handling Errors

Always handle errors (e.g., user canceled, permission denied).

```javascript
.catch((error) => {
  switch (error.code) {
    case 'storage/object-not-found':
      // File doesn't exist
      break;
    case 'storage/unauthorized':
      // User doesn't have permission to access the object
      break;
    case 'storage/canceled':
      // User canceled the upload
      break;
    case 'storage/unknown':
      // Unknown error occurred
      break;
  }
});
```
