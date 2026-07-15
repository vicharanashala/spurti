import { spawn, execSync } from 'child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

async function run() {
  console.log('=== Starting Spurti Development Environment ===');

  // 1. Build the React client
  console.log('Building React client...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to build client, starting server anyway...');
  }

  // 2. Start in-memory MongoDB
  console.log('Starting in-memory MongoDB...');
  const mongoServer = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: 'analysis_summership'
    }
  });
  console.log(`In-memory MongoDB is running at: ${mongoServer.getUri()}`);

  // 3. Start Express server
  console.log('Starting Express server...');
  const serverProcess = spawn('node', ['server/server.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  const cleanup = async () => {
    console.log('\nShutting down dev environment...');
    serverProcess.kill('SIGINT');
    await mongoServer.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  serverProcess.on('exit', async (code) => {
    console.log(`Express server exited with code ${code}`);
    await mongoServer.stop();
    process.exit(code || 0);
  });
}

run().catch(async err => {
  console.error('Failed to run dev environment:', err);
  process.exit(1);
});
