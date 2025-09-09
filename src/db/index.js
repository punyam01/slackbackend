const { MongoClient } = require('mongodb');

let db;

async function connectDb() {
  const client = new MongoClient(process.env.MONGODB_URI, { useUnifiedTopology: true });
  await client.connect();
  db = client.db(); // Uses the default DB from the URI
  console.log('✅ MongoDB connected (native driver)');
}

function getDb() {
  if (!db) throw new Error('DB not connected!');
  return db;
}

module.exports = { connectDb, getDb }; 