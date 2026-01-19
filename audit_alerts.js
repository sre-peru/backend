/**
 * SRE Alert Audit Script
 * Analyzes last 50 CLOSED problems for noise patterns.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const auditAlerts = async () => {
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

    console.log('🔍 Extracción de Muestra (SRE Audit)...');
    
    // 1. Fetch last 50 CLOSED documents
    const problems = await collection.find({ status: "CLOSED" })
      .sort({ startTime: -1 })
      .limit(50)
      .project({ 
        title: 1, 
        severityLevel: 1, 
        duration: 1, 
        Autoremediado: 1, 
        impactLevel: 1, 
        startTime: 1, 
        endTime: 1, 
        impactedEntities: 1 
      })
      .toArray();

    if (problems.length === 0) {
      console.log('No closed problems found.');
      return;
    }

    console.log(`✅ Analyzed ${problems.length} closed problems.\n`);

    // 2. Pattern Analysis
    const analysisMap = {};

    problems.forEach(p => {
        // --- Normalization ---
        let duration = 0;
        if (p.duration !== undefined) {
             duration = typeof p.duration === 'number' ? p.duration : parseFloat(p.duration);
        } else if (p.startTime && p.endTime) {
             const start = new Date(p.startTime).getTime();
             const end = new Date(p.endTime).getTime();
             if (!isNaN(start) && !isNaN(end)) {
                 duration = (end - start) / (1000 * 60); // minutes
             }
        }
        if (isNaN(duration)) duration = 0;

        const title = p.title || "Unknown Title";
        const autoremediated = p.Autoremediado === "Si" || p.Autoremediado === true || p.Autoremediado === "Yes";
        const hasImpact = p.impactedEntities && p.impactedEntities.length > 0;
        const severity = p.severityLevel || "UNKNOWN";

        // --- Classification ---
        let verdict = "Legítimo";
        let action = "Monitorizar";
        let noiseType = null;

        // Profile A: flickering (Low duration + Autoremediated)
        if (duration < 5 && autoremediated) {
            verdict = "Ruido (Parpadeo)";
            action = "Aumentar time-window";
            noiseType = "A";
        }
        // Profile B: False Critical (Resource Contention + Low Duration)
        else if (severity === "RESOURCE_CONTENTION" && duration < 5) {
            verdict = "Ruido (Falso Crítico)";
            action = "Validar umbral consumo";
            noiseType = "B";
        }
        // Profile C: Useless Info (No impact)
        else if (!hasImpact) {
            verdict = "Ruido (Info Inútil)";
            action = "Desactivar alerta vacía";
            noiseType = "C";
        }

        // --- Aggregation ---
        if (!analysisMap[title]) {
            analysisMap[title] = {
                count: 0,
                totalDuration: 0,
                autoremediatedCount: 0,
                verdict: verdict, // Take last/most common verdict logic (simplification)
                action: action,
                noiseType: noiseType
            };
        }

        // Update stats
        analysisMap[title].count++;
        analysisMap[title].totalDuration += duration;
        if (autoremediated) analysisMap[title].autoremediatedCount++;
        
        // Prioritize noise definition if multiple instances differ, but we stick to the last one for simplified matrix or override if noise found
        if (noiseType && analysisMap[title].verdict === "Legítimo") {
             analysisMap[title].verdict = verdict;
             analysisMap[title].action = action;
        }
    });

    // 3. Generate Table Data
    const tableData = Object.keys(analysisMap).map(title => {
        const stats = analysisMap[title];
        const avgDuration = stats.totalDuration / stats.count;
        const isAuto = stats.autoremediatedCount > 0 ? "Si" : "No"; // Simplified for table
        
        return {
            title,
            avgDuration: avgDuration.toFixed(1) + " min",
            isAuto,
            verdict: stats.verdict,
            action: stats.action
        };
    });

    // Output for processing
    const outputPath = path.join(__dirname, 'audit_result.json');
    fs.writeFileSync(outputPath, JSON.stringify(tableData, null, 2));
    console.log('✅ Audit results saved to audit_result.json');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
};

auditAlerts();
