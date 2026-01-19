/**
 * Create MongoDB Indexes for Analytics Performance
 * Run with: node scripts/create-indexes.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const INDEXES = [
  { key: { startTime: -1 }, name: 'idx_startTime_desc' },
  { key: { status: 1 }, name: 'idx_status' },
  { key: { severityLevel: 1 }, name: 'idx_severityLevel' },
  { key: { impactLevel: 1 }, name: 'idx_impactLevel' },
  { key: { duration: 1 }, name: 'idx_duration' },
  { key: { Autoremediado: 1 }, name: 'idx_autoremediado' },
  { key: { 'affectedEntities.entityId.id': 1 }, name: 'idx_affectedEntities_id' },
  { key: { 'managementZones.name': 1 }, name: 'idx_managementZones' },
  { key: { startTime: 1, endTime: 1 }, name: 'idx_timeRange' },
  { key: { title: 1, status: 1 }, name: 'idx_title_status' },
  { key: { 'impactedEntities.entityId': 1 }, name: 'idx_impactedEntities' },
];

async function createIndexes() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno';
  const collectionName = process.env.MONGODB_COLLECTION_NAME || 'problems';

  if (!uri) {
    console.error('❌ MONGODB_URI not found in environment variables');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // List existing indexes
    const existingIndexes = await collection.listIndexes().toArray();
    console.log(`\n📊 Existing indexes: ${existingIndexes.length}`);
    existingIndexes.forEach(idx => console.log(`  - ${idx.name}`));

    console.log('\n🔧 Creating new indexes...\n');

    for (const indexDef of INDEXES) {
      try {
        const result = await collection.createIndex(indexDef.key, { name: indexDef.name });
        console.log(`✅ Created index: ${result}`);
      } catch (error) {
        if (error.code === 85 || error.codeName === 'IndexKeySpecsConflict') {
          console.log(`⚠️  Index already exists: ${indexDef.name}`);
        } else if (error.code === 86 || error.codeName === 'IndexOptionsConflict') {
          console.log(`⚠️  Index with different options exists: ${indexDef.name}`);
        } else {
          console.error(`❌ Failed to create ${indexDef.name}:`, error.message);
        }
      }
    }

    // List final indexes
    const finalIndexes = await collection.listIndexes().toArray();
    console.log(`\n📊 Final indexes: ${finalIndexes.length}`);
    finalIndexes.forEach(idx => console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`));

    console.log('\n✅ Index creation complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

createIndexes();
