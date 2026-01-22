/**
 * Database Analysis Script
 * Analyzes MongoDB collection to validate downtime calculations
 */
import { MongoClient } from 'mongodb';
import { config } from 'dotenv';

config();

const uri = "mongodb+srv://raguerreromauriola_db_user:fOWhYmM9ey4PwSRs@scraping.0robens.mongodb.net/?retryWrites=true&w=majority&appName=scraping";
const dbName = 'problemas-dynatrace-uno';
const collectionName = 'problems';

interface Problem {
  problemId: string;
  title: string;
  displayName?: string;
  severityLevel: string;
  startTime: Date | string;
  endTime: Date | string;
  duration: number;
  affectedEntities?: Array<{ name: string }>;
}

async function analyzeDatabase() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // 1. Get total count
    const totalCount = await collection.countDocuments();
    console.log(`\n📊 Total documents in collection: ${totalCount}`);

    // 2. Get date range
    const oldestDoc = await collection.findOne({}, { sort: { startTime: 1 } });
    const newestDoc = await collection.findOne({}, { sort: { startTime: -1 } });
    
    console.log(`\n📅 Date Range:`);
    console.log(`   Oldest: ${oldestDoc?.startTime}`);
    console.log(`   Newest: ${newestDoc?.startTime}`);

    // 3. Count by month for Sep-Nov 2025
    const months = [
      { name: 'Septiembre 2025', start: new Date('2025-09-01T00:00:00Z'), end: new Date('2025-10-01T00:00:00Z') },
      { name: 'Octubre 2025', start: new Date('2025-10-01T00:00:00Z'), end: new Date('2025-11-01T00:00:00Z') },
      { name: 'Noviembre 2025', start: new Date('2025-11-01T00:00:00Z'), end: new Date('2025-12-01T00:00:00Z') }
    ];

    console.log(`\n📊 Problems by Month (Sep-Nov 2025):`);
    
    for (const month of months) {
      const count = await collection.countDocuments({
        startTime: { $gte: month.start, $lt: month.end }
      });
      console.log(`   ${month.name}: ${count} problems`);
    }

    // 4. Sample problems from Sep-Nov 2025
    console.log(`\n🔍 Sample Problems (Sep-Nov 2025):`);
    
    const sampleProblems = await collection.find({
      startTime: { 
        $gte: new Date('2025-09-01T00:00:00Z'),
        $lt: new Date('2025-12-01T00:00:00Z')
      }
    }).limit(5).toArray() as unknown as Problem[];

    for (const problem of sampleProblems) {
      const start = new Date(problem.startTime);
      const end = new Date(problem.endTime);
      const durationMs = end.getTime() - start.getTime();
      const durationHours = durationMs / 3600000;
      const durationMinutes = durationMs / 60000;

      console.log(`\n   Problem: ${problem.title || problem.displayName}`);
      console.log(`   Severity: ${problem.severityLevel}`);
      console.log(`   Start: ${problem.startTime}`);
      console.log(`   End: ${problem.endTime}`);
      console.log(`   Duration: ${durationHours.toFixed(4)} hours (${durationMinutes.toFixed(2)} minutes)`);
      console.log(`   Service: ${problem.affectedEntities?.[0]?.name || 'Unknown'}`);
    }

    // 5. Calculate total downtime hours for Sep-Nov 2025
    console.log(`\n⏱️  Calculating Total Downtime Hours (Sep-Nov 2025):`);

    const allProblems = await collection.find({
      startTime: { 
        $gte: new Date('2025-09-01T00:00:00Z'),
        $lt: new Date('2025-12-01T00:00:00Z')
      }
    }).toArray() as unknown as Problem[];

    let totalHours = 0;
    const monthlyHours: Record<string, number> = {
      'Septiembre': 0,
      'Octubre': 0,
      'Noviembre': 0
    };

    for (const problem of allProblems) {
      const start = new Date(problem.startTime);
      const end = new Date(problem.endTime);
      const durationMs = end.getTime() - start.getTime();
      const durationHours = durationMs / 3600000;

      totalHours += durationHours;

      // Determine month
      const month = start.getMonth() + 1; // 1-12
      if (month === 9) monthlyHours['Septiembre'] += durationHours;
      else if (month === 10) monthlyHours['Octubre'] += durationHours;
      else if (month === 11) monthlyHours['Noviembre'] += durationHours;
    }

    console.log(`   Total Problems: ${allProblems.length}`);
    console.log(`   Total Hours: ${totalHours.toFixed(2)} h`);
    console.log(`\n   By Month:`);
    console.log(`   Septiembre: ${monthlyHours['Septiembre'].toFixed(2)} h`);
    console.log(`   Octubre: ${monthlyHours['Octubre'].toFixed(2)} h`);
    console.log(`   Noviembre: ${monthlyHours['Noviembre'].toFixed(2)} h`);

    // 6. Severity distribution
    console.log(`\n📊 Severity Distribution (Sep-Nov 2025):`);
    
    const severityCounts: Record<string, { count: number; hours: number }> = {};
    
    for (const problem of allProblems) {
      const severity = problem.severityLevel;
      const start = new Date(problem.startTime);
      const end = new Date(problem.endTime);
      const durationHours = (end.getTime() - start.getTime()) / 3600000;

      if (!severityCounts[severity]) {
        severityCounts[severity] = { count: 0, hours: 0 };
      }
      severityCounts[severity].count++;
      severityCounts[severity].hours += durationHours;
    }

    for (const [severity, data] of Object.entries(severityCounts)) {
      console.log(`   ${severity}: ${data.count} problems, ${data.hours.toFixed(2)} hours`);
    }

    // 7. Validation example
    console.log(`\n✅ Validation Example:`);
    console.log(`   Example from prompt:`);
    console.log(`   startTime: "2025-10-25T23:05:07.481-05:00"`);
    console.log(`   endTime:   "2025-10-25T23:09:45.317-05:00"`);
    
    const exampleStart = new Date("2025-10-25T23:05:07.481-05:00");
    const exampleEnd = new Date("2025-10-25T23:09:45.317-05:00");
    const exampleDurationMs = exampleEnd.getTime() - exampleStart.getTime();
    const exampleDurationHours = exampleDurationMs / 3600000;
    const exampleDurationMinutes = exampleDurationMs / 60000;
    
    console.log(`   Duration: ${exampleDurationHours.toFixed(4)} hours (${exampleDurationMinutes.toFixed(2)} minutes)`);
    console.log(`   Formula: (endTime - startTime) / 3600000`);
    console.log(`   Calculation: (${exampleEnd.getTime()} - ${exampleStart.getTime()}) / 3600000 = ${exampleDurationHours.toFixed(4)}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n✅ Connection closed');
  }
}

analyzeDatabase();
