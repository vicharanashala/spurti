import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../data/mongodb_data');

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath, { recursive: true });
}

console.log('Starting MongoDB Memory Server with persistence...');
console.log('Database path:', dbPath);

try {
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbPath: dbPath,
      storageEngine: 'wiredTiger',
      dbName: 'analysis_summership'
    }
  });

  console.log(`\n========================================`);
  console.log(`MongoDB Memory Server is successfully running!`);
  console.log(`URI: ${mongod.getUri()}`);
  console.log(`Port: 27017`);
  console.log(`Database name: analysis_summership`);
  console.log(`Data directory: ${dbPath}`);
  console.log(`========================================\n`);

  // Handle process termination cleanly
  const cleanup = async () => {
    console.log('Stopping MongoDB Memory Server...');
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

} catch (error) {
  console.error('Failed to start MongoDB Memory Server:', error);
  process.exit(1);
}
