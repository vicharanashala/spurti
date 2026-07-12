import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';

console.log(`Connecting to: ${MONGO_URI}`);
await mongoose.connect(MONGO_URI);
const conn = mongoose.connection;
console.log(`Mongoose state: ${conn.readyState}  (1 = connected)`);
console.log(`Mongoose name: ${conn.name}`);
console.log(`Mongoose host: ${conn.host}`);
console.log(`Mongoose port: ${conn.port}`);
const admin = conn.db.admin();
const dbs = await admin.listDatabases();
console.log(`\nDatabases on host:`);
console.log(JSON.stringify(dbs.databases.map(d => ({ name: d.name, sizeOnDisk: d.sizeOnDisk })), null, 2));

// List collections in our DB
const cols = await conn.db.listCollections().toArray();
console.log(`\nCollections in '${conn.name}': ${cols.length}`);
console.log(JSON.stringify(cols.map(c => c.name), null, 2));

for (const c of cols) {
  try {
    const n = await conn.db.collection(c.name).countDocuments();
    console.log(`  ${c.name}: ${n} documents`);
  } catch (e) {
    console.log(`  ${c.name}: count error (${e.message})`);
  }
}

await mongoose.disconnect();
