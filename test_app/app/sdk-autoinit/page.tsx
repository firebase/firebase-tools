import { AdminApp } from '@/lib/firebaseAdmin';
// import { ClientApp } from '@/lib/firebaseClient';
import { getStorage, getDownloadURL } from 'firebase-admin/storage';
// import { getStorage as getClientStorage, ref, getDownloadURL as getClientDownloadURL } from 'firebase/storage';

async function SDKAutoInitPage() {
  // Admin SDK auto-initialization
  const adminStorage = getStorage(AdminApp); // Admin SDK
  const bucket = adminStorage.bucket();
  const fileRef = bucket.file("tree.jpg");
  const downloadURL = await getDownloadURL(fileRef);

  // // Client SDK auto-initialization
  // const clientStorage = getClientStorage(ClientApp); // Client SDK
  // const clientFileRef = ref(clientStorage, "tree.jpg");
  // const clientDownloadURL = await getClientDownloadURL(clientFileRef);


  return (
    <div>
      <h2><strong>SDK AutoInit</strong></h2>
      <p>FIREBASE_CONFIG: {process.env.FIREBASE_CONFIG}</p> 
      <p>Admin SDK Download URL: {downloadURL}</p>
      {/* <p>Client SDK Download URL: {clientDownloadURL}</p> */}
      <h1>My Photo from Firebase (Admin SDK)</h1>
      <img 
        src={downloadURL} 
        alt="Picture of a tree:)" 
        style={{ maxWidth: '480px', height: 'auto' }} 
      />

      {/* <h1>My Photo from Firebase (Client SDK)</h1>
      <img 
        src={clientDownloadURL} 
        alt="Picture of a tree :)" 
        style={{ maxWidth: '480px', height: 'auto' }} 
      /> */}
    </div>
    
  );
}

export default SDKAutoInitPage;