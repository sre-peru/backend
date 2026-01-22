
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { ObjectId } from 'mongodb';

// Load environment variables
config();

const uri = process.env.MONGODB_URI || "mongodb+srv://raguerreromauriola_db_user:fOWhYmM9ey4PwSRs@scraping.0robens.mongodb.net/?retryWrites=true&w=majority&appName=scraping";
const dbName = process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno';
// We will determine collection name dynamically or fallback to 'problems'
let collectionName = process.env.MONGODB_COLLECTION_NAME || 'problems';

// Configuration
const REPORT_FILE = path.resolve(__dirname, '../../../../reporte-indisponibilidad.html');
const LOG_FILE = path.resolve(__dirname, '../../../../analysis.log');

function log(msg: string) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}

// Clear log
fs.writeFileSync(LOG_FILE, '');

log('📊 Starting Dynatrace Downtime Analysis...');
log(`🔌 Connecting to ${dbName}...`);

const months = [
    { name: 'Septiembre', start: new Date('2024-09-01T00:00:00Z'), end: new Date('2024-10-01T00:00:00Z'), totalHours: 720 },
    { name: 'Octubre', start: new Date('2024-10-01T00:00:00Z'), end: new Date('2024-11-01T00:00:00Z'), totalHours: 744 },
    { name: 'Noviembre', start: new Date('2024-11-01T00:00:00Z'), end: new Date('2024-12-01T00:00:00Z'), totalHours: 720 }
];

async function run() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        
        // --- Collection Discovery ---
        const cols = await db.listCollections().toArray();
        const colNames = cols.map(c => c.name);
        log('📚 Available collections: ' + colNames.join(', '));
        
        if (colNames.includes('problemas-dynatrace-uno')) {
            collectionName = 'problemas-dynatrace-uno';
            log(`✅ Using specified collection: ${collectionName}`);
        } else if (colNames.includes('problems')) {
            collectionName = 'problems';
            log(`⚠️ using default collection: ${collectionName}`);
        } else {
             // Fallback to first non-system collection if possible or error
             log(`❌ Could not find 'problemas-dynatrace-uno' or 'problems'.`);
             if (colNames.length > 0) {
                 collectionName = colNames[0];
                 log(`⚠️ Falling back to: ${collectionName}`);
             }
        }

        const collection = db.collection(collectionName);

        // --- Data Range Verification ---
        const firstDoc = await collection.findOne({}, { sort: { startTime: 1 } });
        const lastDoc = await collection.findOne({}, { sort: { startTime: -1 } });
        
        if (firstDoc) log('📅 Oldest record: ' + firstDoc.startTime);
        if (lastDoc) log('📅 Newest record: ' + lastDoc.startTime);

        // --- 1. Fetch Data with Broad Filters ---
        const query = {
            startTime: { 
                $gte: new Date("2024-09-01T00:00:00Z"), 
                $lt: new Date("2024-12-01T00:00:00Z") 
            }
        };

        const countInRange = await collection.countDocuments(query);
        log(`🔍 Documents in target range (Sep-Nov 2024): ${countInRange}`);

        if (countInRange === 0) {
            log("⚠️ No documents found in date range! Generating empty report.");
        }

        const rawProblems = await collection.find(query).toArray();
        log(`📥 Fetched ${rawProblems.length} potential problems for processing.`);

        // --- 2. Filter False Positives ---
        const validProblems = rawProblems.filter(p => {
            // Note: MongoDB dates are objects. Ensure we treat them as numbers for math.
            const start = new Date(p.startTime).getTime();
            const end = new Date(p.endTime).getTime();
            const durationMs = end - start;
            
            // 1. isFalsePositive = true
            if (p.isFalsePositive === true) return false;

            // 2. Duration < 1 minute
            if (durationMs < 60000) return false;

            // Check name patterns
            const name = (p.title || p.displayName || "").toLowerCase();
            if (/health|ping|status|synthetic|probe/.test(name)) return false;

            // 3. Error rate < 0.1% AND latency < 100ms (unless duration > 5min)
            if (p.impactMetrics) {
                const errorRate = p.impactMetrics.errorRate || 0;
                const latency = p.impactMetrics.latency || 0;
                const isLowImpact = errorRate < 0.1 && latency < 100;
                const isLongDuration = durationMs > 300000;

                if (isLowImpact && !isLongDuration) return false;
            }

            // 5. CRITICAL but duration < 30 seg
            if (p.severityLevel === 'CRITICAL' && durationMs < 30000) return false;

            return true;
        });

        log(`✅ ${validProblems.length} problems passed rigorous filters.`);

        // --- 3. Deduplication (Exact Duplicates) ---
        const uniqueProblemsMap = new Map();
        const uniqueProblems = [];
        
        // Sorting helps ensure consistent selection if duplicates strictly exist
        validProblems.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        for (const p of validProblems) {
            const affectedService = p.affectedEntities?.[0]?.name || "Unknown";
            const startStr = new Date(p.startTime).toISOString();
            const endStr = new Date(p.endTime).toISOString();
            const title = p.title || p.displayName || "No Title";
            
            // Key: startTime + endTime + title + firstAffectedEntity
            const key = `${startStr}|${endStr}|${title}|${affectedService}`;
            
            if (!uniqueProblemsMap.has(key)) {
                uniqueProblemsMap.set(key, true);
                
                const start = new Date(p.startTime);
                const end = new Date(p.endTime);
                const durationMs = end.getTime() - start.getTime();
                
                let month = "Desconocido";
                if (start >= months[0].start && start < months[0].end) month = "Septiembre";
                else if (start >= months[1].start && start < months[1].end) month = "Octubre";
                else if (start >= months[2].start && start < months[2].end) month = "Noviembre";

                uniqueProblems.push({
                    original: p,
                    title: title,
                    severityLevel: p.severityLevel,
                    startTime: start,
                    endTime: end,
                    cleanDurationHours: durationMs / 3600000,
                    cleanDurationMs: durationMs,
                    month,
                    affectedService
                });
            }
        }
        
        log(`🧩 ${uniqueProblems.length} unique problems after deduplication (Final Set).`);

        // --- 4. Analysis & Aggregation ---

        const stats = {
            total: { count: uniqueProblems.length, hours: 0 },
            monthly: {
                Septiembre: { count: 0, hours: 0 },
                Octubre: { count: 0, hours: 0 },
                Noviembre: { count: 0, hours: 0 }
            },
            severity: {
                Septiembre: {}, Octubre: {}, Noviembre: {}
            },
            services: {},
            hourly: new Array(24).fill(0),
            buckets: { '00-04': 0, '04-08': 0, '08-12': 0, '12-16': 0, '16-20': 0, '20-24': 0 }
        };

        // Initialize severities
        ['Septiembre', 'Octubre', 'Noviembre'].forEach(m => {
            ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'AVAILABILITY', 'ERROR', 'PERFORMANCE'].forEach(s => {
                stats.severity[m][s] = { count: 0, hours: 0 };
            });
        });

        for (const p of uniqueProblems) {
            if (p.month === "Desconocido") continue;

            const h = p.cleanDurationHours;
            
            // Total
            stats.total.hours += h;

            // Monthly
            stats.monthly[p.month].count++;
            stats.monthly[p.month].hours += h;

            // Severity
            const sev = p.severityLevel || 'UNKNOWN';
            if (!stats.severity[p.month][sev]) stats.severity[p.month][sev] = { count: 0, hours: 0 };
            stats.severity[p.month][sev].count++;
            stats.severity[p.month][sev].hours += h;

            // Service
            const svc = p.affectedService;
            if (!stats.services[svc]) stats.services[svc] = 0;
            stats.services[svc] += h;

            // Temporal
            const startHour = p.startTime.getUTCHours(); 
            // NOTE: Using UTC hours. If user wants local time (e.g. -5), we might need to adjust.
            // Prompt says "times coherentes". MongoDB usually stores UTC.
            // The prompt "Validations" section asks for "Time coherent".
            // Since User is in UTC-5 (Metadata says e.g. 10:51), but report is general.
            // I'll stick to UTC or maybe shift -5? 
            // Let's assume server/db is UTC standard and report in UTC or assume local. 
            // I will stick to UTC to be safe, or just raw hours.
            
            stats.hourly[startHour] += h;
            
            if (startHour >= 0 && startHour < 4) stats.buckets['00-04'] += h;
            else if (startHour >= 4 && startHour < 8) stats.buckets['04-08'] += h;
            else if (startHour >= 8 && startHour < 12) stats.buckets['08-12'] += h;
            else if (startHour >= 12 && startHour < 16) stats.buckets['12-16'] += h;
            else if (startHour >= 16 && startHour < 20) stats.buckets['16-20'] += h;
            else stats.buckets['20-24'] += h;
        }

        // Top 10 Problems
        const top10 = [...uniqueProblems]
            .sort((a, b) => b.cleanDurationMs - a.cleanDurationMs)
            .slice(0, 10);

        // Top Services (sorted)
        const topServices = Object.entries(stats.services)
            .map(([name, hours]) => ({ name, hours: hours as number }))
            .sort((a, b) => b.hours - a.hours);

        // --- 5. Generate HTML Report ---
        const html = generateHtmlReport(stats, top10, topServices);
        // Match indentation
        // Ensure directory exists? (It should, d:/.../dynatrace-tres usually exists)
        fs.writeFileSync(REPORT_FILE, html);
        log(`📝 Report generated at: ${REPORT_FILE}`);

    } catch (e) {
        log("❌ Error: " + e);
        if (e instanceof Error) log(e.stack || '');
    } finally {
        await client.close();
    }
}

function generateHtmlReport(stats, top10, topServices) {
    const totalDowntimePct = (stats.total.hours / (720 + 744 + 720)) * 100;

    const septPct = (stats.monthly.Septiembre.hours / 720) * 100;
    const octPct = (stats.monthly.Octubre.hours / 744) * 100;
    const novPct = (stats.monthly.Noviembre.hours / 720) * 100;

    const septOctChange = octPct - septPct;
    const octNovChange = novPct - octPct;
    
    let trendText = "Estable";
    if (octNovChange < -0.01) trendText = "Mejorando 📉"; // Less downtime is better
    else if (octNovChange > 0.01) trendText = "Empeorando 📈";

    const monthlyHours = [stats.monthly.Septiembre.hours, stats.monthly.Octubre.hours, stats.monthly.Noviembre.hours];
    
    const severityTotals = {};
    ['Septiembre', 'Octubre', 'Noviembre'].forEach(m => {
        Object.keys(stats.severity[m]).forEach(s => {
            if (!severityTotals[s]) severityTotals[s] = 0;
            severityTotals[s] += stats.severity[m][s].hours;
        });
    });
    const severityLabels = Object.keys(severityTotals).filter(k => severityTotals[k] > 0);
    const severityData = severityLabels.map(k => severityTotals[k]);

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte de Indisponibilidad - Dynatrace</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Roboto', sans-serif; background: #f5f6fa; color: #2d3436; margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1, h2, h3 { color: #2d3436; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        h1 { text-align: center; color: #0984e3; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .kpi-card { background: #f1f2f6; pading: 20px; border-radius: 8px; text-align: center; padding: 20px; }
        .kpi-value { font-size: 24px; font-weight: bold; color: #0984e3; }
        .kpi-label { font-size: 14px; color: #636e72; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8f9fa; font-weight: 600; }
        .chart-container { position: relative; height: 300px; width: 100%; margin-bottom: 40px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; color: white; }
        .bg-crit { background-color: #d63031; }
        .bg-high { background-color: #e17055; }
        .bg-med { background-color: #fdcb6e; color: black; }
        .report-section { margin-bottom: 50px; }
        .positive { color: green; font-weight: bold; }
        .negative { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 Reporte de Indisponibilidad Real (Sep-Nov 2024)</h1>
        <p style="text-align: center; color: #666;">Generado automáticamente eliminando falsos positivos (duración < 1min, pruebas sintéticas, etc.)</p>
        
        <div class="kpi-grid">
            <div class="kpi-card">
                <div class="kpi-value">${stats.total.count}</div>
                <div class="kpi-label">Problemas Reales</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-value">${stats.total.hours.toFixed(2)} h</div>
                <div class="kpi-label">Horas Downtime</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-value">${totalDowntimePct.toFixed(3)}%</div>
                <div class="kpi-label">Downtime Global</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-value">${trendText}</div>
                <div class="kpi-label">Tendencia Reciente</div>
            </div>
        </div>

        <div class="report-section">
            <h2>1. Resumen Mensual</h2>
            <table>
                <thead>
                    <tr>
                        <th>Mes</th>
                        <th>Problemas</th>
                        <th>Horas Downtime</th>
                        <th>Downtime %</th>
                        <th>Tendencia</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Septiembre</td>
                        <td>${stats.monthly.Septiembre.count}</td>
                        <td>${stats.monthly.Septiembre.hours.toFixed(2)} h</td>
                        <td>${septPct.toFixed(3)}%</td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td>Octubre</td>
                        <td>${stats.monthly.Octubre.count}</td>
                        <td>${stats.monthly.Octubre.hours.toFixed(2)} h</td>
                        <td>${octPct.toFixed(3)}%</td>
                        <td class="${septOctChange > 0 ? 'negative' : 'positive'}">${septOctChange > 0 ? '+' : ''}${septOctChange.toFixed(3)}%</td>
                    </tr>
                    <tr>
                        <td>Noviembre</td>
                        <td>${stats.monthly.Noviembre.count}</td>
                        <td>${stats.monthly.Noviembre.hours.toFixed(2)} h</td>
                        <td>${novPct.toFixed(3)}%</td>
                        <td class="${octNovChange > 0 ? 'negative' : 'positive'}">${octNovChange > 0 ? '+' : ''}${octNovChange.toFixed(3)}%</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="grid-2">
            <div class="chart-container">
                <h3>Horas por Mes</h3>
                <canvas id="monthlyChart"></canvas>
            </div>
            <div class="chart-container">
                <h3>Distribución por Severidad (Global)</h3>
                <canvas id="severityChart"></canvas>
            </div>
        </div>

        <div class="report-section">
            <h2>3. Top 10 Problemas Más Largos (Causa Raíz)</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th>Problema</th>
                        <th>Servicio</th>
                        <th>Severidad</th>
                        <th>Fecha</th>
                        <th>Horas</th>
                    </tr>
                </thead>
                <tbody>
                    ${top10.map((p, i) => `
                    <tr>
                        <td>${i+1}</td>
                        <td style="font-size: 13px;">${p.title}</td>
                        <td>${p.affectedService}</td>
                        <td><span class="badge ${['CRITICAL','AVAILABILITY'].includes(p.severityLevel) ? 'bg-crit' : 'bg-med'}">${p.severityLevel}</span></td>
                        <td>${p.startTime.toISOString().split('T')[0]}</td>
                        <td><strong>${p.cleanDurationHours.toFixed(2)}</strong></td>
                    </tr>
                    `).join('')}
                    ${top10.length === 0 ? '<tr><td colspan="6" style="text-align:center">No se encontraron problemas que cumplan los criterios.</td></tr>' : ''}
                </tbody>
            </table>
        </div>

        <div class="report-section">
            <h2>4. Servicios Más Afectados</h2>
            <div class="chart-container">
                <canvas id="servicesChart"></canvas>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Servicio</th>
                        <th>Horas Totales</th>
                        <th>% del Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${topServices.slice(0, 10).map(s => `
                    <tr>
                        <td>${s.name}</td>
                        <td>${s.hours.toFixed(2)} h</td>
                        <td>${stats.total.hours > 0 ? ((s.hours / stats.total.hours) * 100).toFixed(1) : 0}%</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="report-section">
            <h2>5. Análisis Temporal (Horas del día UTC)</h2>
            <div class="chart-container">
                <canvas id="hourlyChart"></canvas>
            </div>
            <div style="display: flex; justify-content: space-around; margin-top: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                ${Object.entries(stats.buckets).map(([bucket, hours]) => `
                    <div style="text-align: center;">
                        <div style="font-weight: bold; color: #2d3436;">${bucket}</div>
                        <div style="color: #0984e3; font-size: 1.1em;">${(hours as number).toFixed(1)} h</div>
                    </div>
                `).join('')}
            </div>
        </div>

    </div>

    <script>
        // Charts
        const commonOptions = { responsive: true, maintainAspectRatio: false };

        new Chart(document.getElementById('monthlyChart'), {
            type: 'bar',
            data: {
                labels: ['Septiembre', 'Octubre', 'Noviembre'],
                datasets: [{
                    label: 'Horas Downtime',
                    data: [${monthlyHours.join(',')}],
                    backgroundColor: '#0984e3',
                    borderRadius: 4
                }]
            },
            options: commonOptions
        });

        new Chart(document.getElementById('severityChart'), {
            type: 'doughnut',
            data: {
                labels: ${JSON.stringify(severityLabels)},
                datasets: [{
                    data: ${JSON.stringify(severityData)},
                    backgroundColor: ['#d63031', '#e17055', '#fdcb6e', '#00b894', '#6c5ce7']
                }]
            },
            options: commonOptions
        });

        new Chart(document.getElementById('servicesChart'), {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(topServices.slice(0, 10).map(s => s.name))},
                datasets: [{
                    label: 'Horas Afectadas',
                    data: ${JSON.stringify(topServices.slice(0, 10).map(s => s.hours))},
                    backgroundColor: '#6c5ce7',
                    borderRadius: 4
                }]
            },
            options: { ...commonOptions, indexAxis: 'y' }
        });

        new Chart(document.getElementById('hourlyChart'), {
            type: 'line',
            data: {
                labels: ${JSON.stringify(Array.from({length:24}, (_,i) => i + ":00"))},
                datasets: [{
                    label: 'Horas Acumuladas',
                    data: ${JSON.stringify(stats.hourly)},
                    borderColor: '#00b894',
                    tension: 0.4,
                    fill: true,
                    backgroundColor: 'rgba(0, 184, 148, 0.1)'
                }]
            },
            options: commonOptions
        });
    </script>
</body>
</html>`;
}

run();
