
import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
config();

const uri = process.env.MONGODB_URI || "mongodb+srv://raguerreromauriola_db_user:fOWhYmM9ey4PwSRs@scraping.0robens.mongodb.net/?retryWrites=true&w=majority&appName=scraping";
const dbName = process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno';

async function main() {
    const client = new MongoClient(uri);
    try {
        await client.connect();
        console.log(`Connected to ${uri.split('@')[1]}`);
        
        const db = client.db(dbName);
        console.log(`Using DB: ${dbName}`);
        
        const collections = await db.listCollections().toArray();
        console.log('Collections:');
        collections.forEach(c => console.log(` - ${c.name}`));
        
        // Also try to count documents in likely candidates
        for (const c of collections) {
            const count = await db.collection(c.name).countDocuments();
            console.log(`   Count in ${c.name}: ${count}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
main();
