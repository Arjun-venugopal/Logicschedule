import jwt from 'jsonwebtoken';
import http from 'http';
import { connectFirebase, getDb } from './config/firebase';
import { config } from './config/config';

async function getValidToken() {
  connectFirebase();
  const db = getDb();
  let snapshot = await db.collection('users').where('role', '==', 'Admin').limit(1).get();
  if (snapshot.empty) {
    snapshot = await db.collection('users').limit(1).get();
  }
  if (snapshot.empty) {
    console.error('No users found in DB to test auth');
    return null;
  }
  const doc = snapshot.docs[0];
  const user: any = { _id: doc.id, ...doc.data() };
  console.log(`🔑 Using test user: ${user.email} (${user._id}, role: ${user.role})`);
  return jwt.sign({ id: user._id, role: user.role || 'Admin' }, config.JWT_SECRET, { expiresIn: '1d' });
}

const routes = [
  '/stats',
  '/teachers',
  '/teachers/timings',
  '/batches',
  '/schedules',
  '/students',
  '/demo-sessions',
  '/sales-people',
  '/demo-slots'
];

function testRoute(r: string, token: string) {
  return new Promise<void>((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path: r,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 500) {
          console.error(`🚨 SERVER ERROR ${res.statusCode} on ${r}:`, data);
        } else {
          console.log(`✅ ${r} -> Status ${res.statusCode}`);
        }
        resolve();
      });
    });
    req.on('error', (err) => {
      console.error(`❌ Connection error on ${r}:`, err.message);
      resolve();
    });
    req.end();
  });
}

async function run() {
  const token = await getValidToken();
  if (!token) return;
  for (const r of routes) {
    await testRoute(r, token);
  }
}

run();
