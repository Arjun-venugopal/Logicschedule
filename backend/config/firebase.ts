import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

const connectFirebase = () => {
  try {
    if (!getApps().length) {
      // Strategy 1: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT env var (Production stringified JSON / Base64)
      const envServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;

      if (envServiceAccount) {
        let parsedConfig;
        if (envServiceAccount.trim().startsWith('{')) {
          parsedConfig = JSON.parse(envServiceAccount);
        } else {
          // Assume base64 string
          const decoded = Buffer.from(envServiceAccount, 'base64').toString('utf8');
          parsedConfig = JSON.parse(decoded);
        }
        initializeApp({
          credential: cert(parsedConfig),
        });
      }
      // Strategy 2: Individual environment variables
      else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      }
      // Strategy 3: Search for local service account JSON file in multiple possible paths
      else {
        const possiblePaths = [
          path.resolve(process.cwd(), 'firebase-service-account.json'),
          path.resolve(process.cwd(), 'firebase-service-account.json.json'),
          path.resolve(process.cwd(), 'backend', 'firebase-service-account.json'),
          path.resolve(__dirname, '..', 'firebase-service-account.json'),
          path.resolve(__dirname, '..', '..', 'firebase-service-account.json'),
        ];

        const existingPath = possiblePaths.find((p) => fs.existsSync(p));

        if (existingPath) {
          const serviceAccount = require(existingPath);
          initializeApp({
            credential: cert(serviceAccount),
          });
        } else {
          // Strategy 4: Fallback to default GOOGLE_APPLICATION_CREDENTIALS environment setting
          initializeApp();
        }
      }

      getFirestore().settings({ ignoreUndefinedProperties: true });
    }
    console.log('✅ Firebase Admin SDK Initialized. Connected to Firestore.');
  } catch (error: any) {
    console.error(`❌ Firebase connection failed: ${error.message}`);
    throw error;
  }
};

const getDb = () => getFirestore();

export { connectFirebase, getDb };

