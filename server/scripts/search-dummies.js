import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';

await mongoose.connect(MONGO_URI);

const total = await Student.countDocuments();
console.log(`Total students in DB: ${total}`);

const byName = await Student.aggregate([
  { $match: { name: { $regex: 'dummy', $options: 'i' } } },
  { $group: { _id: '$name', count: { $sum: 1 }, emails: { $push: '$email' } } },
  { $sort: { _id: 1 } }
]);
console.log(`\n--- Names matching /dummy/i: ${byName.length} groups ---`);
console.log(JSON.stringify(byName, null, 2));

const byEmail = await Student.aggregate([
  { $match: { email: { $regex: 'spurti\.test', $options: 'i' } } },
  { $group: { _id: '$email', name: { $first: '$name' } } },
  { $sort: { _id: 1 } }
]);
console.log(`\n--- Emails matching /spurti.test/i: ${byEmail.length} ---`);
console.log(JSON.stringify(byEmail, null, 2));

await mongoose.disconnect();
