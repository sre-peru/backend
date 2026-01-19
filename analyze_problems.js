/**
 * MongoDB Analysis Script
 * Analyzes last 50 problems
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const analyzeProblems = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not found');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno');
    const collection = db.collection(process.env.MONGODB_COLLECTION_NAME || 'problems');

    // 1. Fetch last 50 documents
    console.log('Fetching last 50 documents...');
    const problems = await collection.find({})
      .sort({ startTime: -1 })
      .limit(50)
      .toArray();

    if (problems.length === 0) {
      console.log('No problems found.');
      console.log('[]');
      return;
    }

    // DEBUG: Write the first document to check field structure
    // DEBUG: Write the first document to check field structure
    console.log('\n--- DEBUG: Saving First Document Sample ---');
    fs.writeFileSync(path.join(__dirname, 'debug_sample.json'), JSON.stringify(problems[0], null, 2));
    console.log('Sample saved to debug_sample.json');


    // 2. Analyze in memory
    const stats = {};
    let durationFoundCount = 0;

    problems.forEach(p => {
        const title = p.title || 'Unknown Title';
        
        let duration = 0;
        // User said "duration" is the field. Let's check strictly for it.
        if (p.duration !== undefined) {
             durationFoundCount++;
             if (typeof p.duration === 'number') {
                duration = p.duration;
             } else {
                duration = parseFloat(p.duration);
             }
        } else if (p.startTime && p.endTime) {
             // Fallback: Calculate duration in minutes if explicit field is missing
             const start = new Date(p.startTime).getTime();
             const end = new Date(p.endTime).getTime();
             if (!isNaN(start) && !isNaN(end)) {
                 // Duration in minutes
                 duration = (end - start) / (1000 * 60); 
             }
        }
        
        if (isNaN(duration)) duration = 0;

        if (!stats[title]) {
            stats[title] = { count: 0, totalDuration: 0 };
        }
        stats[title].count += 1;
        stats[title].totalDuration += duration;
    });

    console.log(`\nFound 'duration' field in ${durationFoundCount} out of ${problems.length} documents.`);
    
    // Save stats to detailed file
    const statsContent = `
Analysis of last ${problems.length} documents:
- Documents with explicit 'duration' field: ${durationFoundCount}
- Documents using calculated duration: ${problems.length - durationFoundCount}
    `;
    fs.writeFileSync(path.join(__dirname, 'field_stats.txt'), statsContent);



    // 3. Generate summary array
    const summary = Object.keys(stats).map(title => {
        const s = stats[title];
        return {
            "_id": title,
            "count": s.count,
            "avgDuration": s.count > 0 ? (s.totalDuration / s.count) : 0
        };
    });

    // Write final JSON to file
    // Write final JSON to file
    const outputPath = path.join(__dirname, 'analysis_result.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
    console.log('✅ Analysis saved to analysis_result.json');


  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
};

analyzeProblems();
