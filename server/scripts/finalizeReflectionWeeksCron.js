import 'dotenv/config';
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import { finalizeReflectionWeeks } from '../services/reflectionService.js';

(async function main(){
  try {
    console.log('[finalizeCron] starting. Using MONGO_URI from config.');
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('[finalizeCron] connected to DB:', mongoose.connection.name);

    const results = await finalizeReflectionWeeks();

    if (!results || results.length === 0) {
      console.log('[finalizeCron] no weeks finalized.');
    } else {
      for (const r of results) {
        console.log(`[finalizeCron] finalized ${r.weekLabel}: awardedCount=${r.awardedCount}, top=${JSON.stringify(r.topReflectionIds)}`);
      }
    }

    await mongoose.disconnect();
    console.log('[finalizeCron] done.');
    process.exit(0);
  } catch (err) {
    console.error('[finalizeCron] error:', err && err.stack ? err.stack : err);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  }
})();
