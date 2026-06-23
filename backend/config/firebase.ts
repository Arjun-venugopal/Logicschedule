import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

const connectFirebase = () => {
  try {
    if (!getApps().length) {
      const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        initializeApp({
          credential: cert(serviceAccount)
        });
      } else {
        // Fallback to default (relies on GOOGLE_APPLICATION_CREDENTIALS env var)
        initializeApp();
      }
    }
    console.log('✅ Firebase Admin SDK Initialized. Connected to Firestore.');
  } catch (error: any) {
    console.error(`❌ Firebase connection failed: ${error.message}`);
    throw error;
  }
};

const getDb = () => getFirestore();

export { connectFirebase, getDb };
