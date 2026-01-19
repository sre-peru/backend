/**
 * SRE Discovery Script (Phase 1)
 * 1. Confirms collection names.
 * 2. Maps schema of 'problems' collection.
 * 3. Checks date ranges to inform Phase 2 strategy.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const runDiscovery = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('❌ MONGODB_URI missing'); process.exit(1); }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno');
    
    // 1. List Collections
    console.log('🔍 [1] Collections:');
    const cols = await db.listCollections().toArray();
    cols.forEach(c => console.log(`   - ${c.name}`));

    const colName = process.env.MONGODB_COLLECTION_NAME || 'problems';
    const collection = db.collection(colName);

    // 2. Schema Analysis (Limit 1)
    console.log(`\n🔍 [2] Schema Analysis (${colName}):`);
    const sample = await collection.findOne({ status: "CLOSED" });
    
    if (sample) {
        console.log('--- Sample Document Keys ---');
        console.log(Object.keys(sample));
        
        console.log('\n--- Key Fields Inspection ---');
        console.log(`Title: ${sample.title}`);
        console.log(`Severity: ${sample.severityLevel}`);
        console.log(`Status: ${sample.status}`);
        console.log(`Impact: ${sample.impactLevel}`);
        console.log(`Impacted Entities: ${JSON.stringify(sample.impactedEntities ? sample.impactedEntities.length : 0)}`);
        console.log(`Autoremediated: ${sample.Autoremediado}`);
        console.log(`Start: ${sample.startTime}`);
        console.log(`End: ${sample.endTime}`);
        
        // Check for specific fields requested
        console.log(`Duration Field Exists? ${sample.duration !== undefined}`);
        console.log(`Ticket/OnCall Field? ${JSON.stringify(sample.recentComments)}`); // Often tickets are in comments
        
    } else {
        console.log('⚠️ No CLOSED documents found for schema analysis.');
    }

    // 3. Date Range Check (for Phase 2 planning)
    console.log('\n🔍 [3] Data Freshness Check:');
    const firstDoc = await collection.find({}, { projection: { startTime: 1 } }).sort({ startTime: 1 }).limit(1).toArray();
    const lastDoc = await collection.find({}, { projection: { startTime: 1 } }).sort({ startTime: -1 }).limit(1).toArray();
    
    if (firstDoc.length && lastDoc.length) {
        console.log(`Oldest: ${firstDoc[0].startTime}`);
        console.log(`Newest: ${lastDoc[0].startTime}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
};

runDiscovery();
