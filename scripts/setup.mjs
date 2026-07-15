import { execSync, fork } from 'child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

async function run() {
  console.log('=== Running Spurti Setup ===');

  // 1. Install client dependencies
  console.log('Installing client dependencies...');
  execSync('npm --prefix client install', { stdio: 'inherit' });

  // 2. Start in-memory MongoDB
  console.log('Starting temporary MongoDB for database setup...');
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: 'analysis_summership'
    }
  });
  console.log(`Temporary MongoDB is running at: ${mongoServer.getUri()}`);

  try {
    // 3. Seed students
    console.log('Seeding student database...');
    execSync('node seed-students.js', { stdio: 'inherit' });

    // 4. Rebuild sessions & transactions
    console.log('Rebuilding sessions & SP transactions...');
    execSync('node server/scripts/rebuild.js', { stdio: 'inherit' });
  } finally {
    // 5. Stop MongoDB
    console.log('Stopping temporary MongoDB...');
    await mongoServer.stop();
  }

  // 6. Build the client
  console.log('Building React client...');
  execSync('npm --prefix client run build', { stdio: 'inherit' });

  console.log('=== Setup Completed Successfully! ===');
}

run().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
