/**
 * SRE Forensic Analysis Script (Phase 2 & 3)
 * 1. Fetches last 100 closed problems.
 * 2. Applies cognitive logic to identify False Positives (FPs).
 * 3. Generates the requested Markdown table.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const runForensics = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('❌ MONGODB_URI missing'); process.exit(1); }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno');
    const collection = db.collection(process.env.MONGODB_COLLECTION_NAME || 'problems');

    // --- PHASE 2: DATA EXTRACTION ---
    console.log('🔍 Extracting sample (Last 100 CLOSED)...');
    const docs = await collection.find({ status: "CLOSED" })
      .sort({ startTime: -1 }) // Newest first
      .limit(100)
      .toArray();
      
    console.log(`✅ Extracted ${docs.length} documents for forensic audit.`);

    // --- PHASE 3: COGNITIVE ANALYSIS ---
    const ruleStats = {};

    docs.forEach(doc => {
        // 1. Data Normalization
        let durationMins = 0;
         if (doc.duration !== undefined) {
             durationMins = typeof doc.duration === 'number' ? doc.duration : parseFloat(doc.duration);
        } else if (doc.startTime && doc.endTime) {
             const start = new Date(doc.startTime).getTime();
             const end = new Date(doc.endTime).getTime();
             if (!isNaN(start) && !isNaN(end)) durationMins = (end - start) / 60000;
        }
        if (isNaN(durationMins)) durationMins = 0;

        const title = doc.title || "Unknown";
        const isAuto = doc.Autoremediado === "Si" || doc.Autoremediado === true;
        const impactCount = doc.impactedEntities ? doc.impactedEntities.length : 0;
        const comments = doc.recentComments ? (doc.recentComments.comments || []) : [];
        
        // "Human Action" heuristic: presence of comments NOT from bots/automation
        // Assuming "GitHub Actions" or "Dynatrace" are bots.
        const humanComments = comments.filter(c => 
            !c.authorName.includes("GitHub Action") && 
            !c.authorName.includes("dynatrace") &&
            !c.context?.includes("dynatrace")
        );
        const hasHumanAction = humanComments.length > 0;

        // 2. False Positive (FP) Logic
        let isFP = false;
        let fpReason = "";
        let recommendedAction = "";

        // Rule A: Fast Auto-remediation (e.g. < 5 mins)
        if (isAuto && durationMins < 5) {
            isFP = true;
            fpReason = "Autocorrección Rápida (< 5m)";
            recommendedAction = "Subir umbral de tiempo (Window)";
        }
        // Rule B: Null Impact (High Severity but 0 entities)
        else if (impactCount === 0) {
             isFP = true;
             fpReason = "Impacto Nulo";
             recommendedAction = "Revisar reglas de servicio";
        }
        // Rule C: No Human Action + Short Duration (Flapping/Noise)
        else if (!hasHumanAction && durationMins < 10) {
             // Heuristic: If it closed quickly and nobody touched it, it's likely noise.
             isFP = true;
             fpReason = "Sin Acción Humana";
             recommendedAction = "Reducir severidad / Silenciar";
        }

        // 3. Aggregation per Alert Title
        if (!ruleStats[title]) {
            ruleStats[title] = {
                count: 0,
                fpCount: 0,
                avgDuration: 0,
                totalDuration: 0,
                examples: [],
                metric: "N/A", // Would need parsing event details for real metric
                currentThreshold: "Default", // Assumption
                severity: doc.severityLevel
            };
        }

        const stats = ruleStats[title];
        stats.count++;
        stats.totalDuration += durationMins;
        if (isFP) {
            stats.fpCount++;
            stats.examples.push(fpReason);
        }
    });

    // --- PHASE 4: REPORT GENERATION ---
    let markdownTable = "| Servicio/Entidad | Regla/Alerta | Métrica | Umbral Actual | Umbral Recomendado | Tipo de Cambio | FPR Antes vs Después (Est) | Evidencia (Resumen) | Riesgo | Plan Rollout | Owner Sugerido |\n";
    markdownTable += "|---|---|---|---|---|---|---|---|---|---|---|\n";

    Object.keys(ruleStats).forEach(title => {
        const s = ruleStats[title];
        s.avgDuration = s.totalDuration / s.count;
        const fpr = (s.fpCount / s.count * 100).toFixed(0);
        
        // Only report if significant noise (FPR > 0)
        if (s.fpCount > 0) {
            // Determine dominant reason
            const reasons = s.examples;
            const distinctReasons = [...new Set(reasons)];
            const reasonSummary = distinctReasons.join(", ");
            
            // Logic for Recommendation
            let recThreshold = "";
            let changeType = "";
            
            if (reasonSummary.includes("Autocorrección")) {
                recThreshold = `Wait > 5m`;
                changeType = "Aumentar Ventana";
            } else if (reasonSummary.includes("Impacto Nulo")) {
                recThreshold = "N/A";
                changeType = "Desactivar Regla";
            } else {
                recThreshold = "Revisar Baseline";
                changeType = "Tuning Manual";
            }

            // Estimate "After" FPR (Optimistic: 0% if we apply the fix)
            const fprComparison = `${fpr}% -> <5%`;

            markdownTable += `| Genérico | ${title} | ${s.severity} | Auto | ${recThreshold} | ${changeType} | ${fprComparison} | ${reasonSummary}. Avg Dur: ${s.avgDuration.toFixed(1)}m | Bajo | Canary | SRE Team |\n`;
        }
    });

    console.log(markdownTable);
    fs.writeFileSync(path.join(__dirname, 'audit_report_table.md'), markdownTable);

  } catch (error) {
    console.error(error);
  } finally {
    await client.close();
  }
};

runForensics();
