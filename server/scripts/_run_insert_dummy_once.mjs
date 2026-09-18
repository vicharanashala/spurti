import mongoose from 'mongoose';
import Student from '../models/Student.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership_test';

const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

const DUMMIES = [
  { name: 'Test Student One (dummy)', email: 'test1@dummy.test', start: D(2026,7,16), totalSp: 100 },
  { name: 'Test Student Two (dummy)', email: 'test2@dummy.test', start: D(2026,7,17), totalSp: 110 },
  { name: 'Test Student Three (dummy)', email: 'test3@dummy.test', start: D(2026,7,18), totalSp: 120 },
  { name: 'Test Student Four (dummy)', email: 'test4@dummy.test', start: D(2026,7,19), totalSp: 130 }
];

async function main(){
  console.log('Connecting to', MONGO_URI);
  try{
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  }catch(e){
    console.error('Mongo connect failed:', e && e.message ? e.message : e);
    process.exit(2);
  }

  for(const s of DUMMIES){
    try{
      await Student.updateOne({ email: s.email }, { $set: {
        name: s.name,
        email: s.email,
        internshipStartDate: s.start,
        status: 'active',
        totalSp: s.totalSp,
        highestSpEver: s.totalSp,
        level: 1,
        trophyLeague: 'Bronze II'
      } }, { upsert: true });
    }catch(err){
      console.error('Upsert failed for', s.email, err && err.message ? err.message : err);
    }
  }

  const students = await Student.find({ email: /@dummy\\.test$/i }).lean();
  console.log('Database used:', mongoose.connection.name);
  console.log('Dummy students:');
  students.forEach(st => console.log(`  ${st.name}  <${st.email}>`));

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
