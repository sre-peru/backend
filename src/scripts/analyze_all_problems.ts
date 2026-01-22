/**
 * Real Database Analysis - Extract ALL 30,692 Problems
 * Total Duration: 464,834.695 hours (322 days 19 hours)
 */
import { MongoClient } from 'mongodb';
import * as fs from 'fs';
import * as path from 'path';

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

async function analyzeAllProblems() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Conectado a MongoDB\n');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Extraer TODOS los problemas
    console.log('📥 Extrayendo TODOS los problemas...\n');
    const allProblems = await collection.find({}).toArray() as unknown as Problem[];

    console.log(`📊 Total de problemas: ${allProblems.length.toLocaleString()}`);

    // Calcular duración total y por problema
    let totalDurationHours = 0;
    const problemsWithDuration = allProblems.map(p => {
      const start = new Date(p.startTime).getTime();
      const end = new Date(p.endTime).getTime();
      const durationMs = end - start;
      const durationHours = durationMs / 3600000;

      totalDurationHours += durationHours;

      const startDate = new Date(p.startTime);
      return {
        ...p,
        durationMs,
        durationHours,
        year: startDate.getFullYear(),
        month: startDate.getMonth() + 1,
        monthKey: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
      };
    });

    const totalDays = Math.floor(totalDurationHours / 24);
    const remainingHours = totalDurationHours % 24;

    console.log(`⏱️  Duración Total: ${totalDurationHours.toLocaleString('en-US', { maximumFractionDigits: 3 })} horas`);
    console.log(`   (${totalDays} días ${Math.floor(remainingHours)} horas)\n`);

    // Agrupar por mes
    const monthlyData: Record<string, {
      name: string;
      problems: number;
      totalHours: number;
      bySeverity: Record<string, { count: number; hours: number }>;
      topProblems: any[];
    }> = {};

    const monthNames: Record<number, string> = {
      1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
      5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
      9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
    };

    problemsWithDuration.forEach(p => {
      if (!monthlyData[p.monthKey]) {
        monthlyData[p.monthKey] = {
          name: `${monthNames[p.month]} ${p.year}`,
          problems: 0,
          totalHours: 0,
          bySeverity: {},
          topProblems: []
        };
      }

      const month = monthlyData[p.monthKey];
      month.problems++;
      month.totalHours += p.durationHours;

      // Por severidad
      if (!month.bySeverity[p.severityLevel]) {
        month.bySeverity[p.severityLevel] = { count: 0, hours: 0 };
      }
      month.bySeverity[p.severityLevel].count++;
      month.bySeverity[p.severityLevel].hours += p.durationHours;

      // Guardar para top problems
      month.topProblems.push(p);
    });

    // Ordenar top problems por mes
    Object.values(monthlyData).forEach(month => {
      month.topProblems.sort((a, b) => b.durationHours - a.durationHours);
      month.topProblems = month.topProblems.slice(0, 10);
    });

    // Mostrar resumen por mes
    console.log('═'.repeat(120));
    console.log('📅 DISTRIBUCIÓN POR MES:\n');

    const sortedMonths = Object.entries(monthlyData).sort(([a], [b]) => a.localeCompare(b));

    sortedMonths.forEach(([monthKey, data]) => {
      console.log(`\n📆 ${data.name.toUpperCase()}`);
      console.log('─'.repeat(120));
      console.log(`   Problemas: ${data.problems.toLocaleString()}`);
      console.log(`   Horas: ${data.totalHours.toLocaleString('en-US', { maximumFractionDigits: 2 })} h`);
      console.log(`   % del Total: ${((data.totalHours / totalDurationHours) * 100).toFixed(2)}%`);
      
      console.log(`\n   Por Severidad:`);
      Object.entries(data.bySeverity)
        .sort(([, a], [, b]) => b.hours - a.hours)
        .slice(0, 5)
        .forEach(([severity, stats]) => {
          console.log(`      • ${severity.padEnd(20)}: ${stats.count.toString().padStart(5)} problemas | ${stats.hours.toFixed(2).padStart(10)} h`);
        });
    });

    console.log('\n' + '═'.repeat(120));

    // TOP 10 GLOBAL
    const top10Global = problemsWithDuration
      .sort((a, b) => b.durationHours - a.durationHours)
      .slice(0, 10);

    console.log('\n🏆 TOP 10 PROBLEMAS MÁS LARGOS (GLOBAL):\n');
    console.log('═'.repeat(120));
    
    top10Global.forEach((p, i) => {
      const service = p.affectedEntities?.[0]?.name || 'Unknown';
      const title = (p.title || p.displayName || 'Sin título').substring(0, 50);
      const date = new Date(p.startTime).toISOString().split('T')[0];
      
      console.log(`${(i + 1).toString().padStart(2)}. ${title.padEnd(52)} | ${service.padEnd(25)} | ${p.severityLevel.padEnd(15)} | ${date} | ${p.durationHours.toFixed(2).padStart(10)} h`);
    });
    console.log('═'.repeat(120));

    // Distribución por severidad global
    const severityGlobal: Record<string, { count: number; hours: number }> = {};
    problemsWithDuration.forEach(p => {
      if (!severityGlobal[p.severityLevel]) {
        severityGlobal[p.severityLevel] = { count: 0, hours: 0 };
      }
      severityGlobal[p.severityLevel].count++;
      severityGlobal[p.severityLevel].hours += p.durationHours;
    });

    console.log('\n📊 DISTRIBUCIÓN POR SEVERIDAD (GLOBAL):\n');
    console.log('═'.repeat(120));
    Object.entries(severityGlobal)
      .sort(([, a], [, b]) => b.hours - a.hours)
      .forEach(([severity, stats]) => {
        const percent = (stats.hours / totalDurationHours * 100).toFixed(2);
        console.log(`   ${severity.padEnd(25)}: ${stats.count.toString().padStart(6)} problemas | ${stats.hours.toFixed(2).padStart(12)} h (${percent}%)`);
      });
    console.log('═'.repeat(120));

    // Generar JSON para el dashboard
    const dashboardData = {
      totalProblems: allProblems.length,
      totalHours: parseFloat(totalDurationHours.toFixed(2)),
      totalDays: totalDays,
      monthlySummary: sortedMonths.map(([monthKey, data]) => ({
        month: monthKey,
        name: data.name,
        problems: data.problems,
        hours: parseFloat(data.totalHours.toFixed(2)),
        percentOfTotal: parseFloat(((data.totalHours / totalDurationHours) * 100).toFixed(2)),
        bySeverity: Object.fromEntries(
          Object.entries(data.bySeverity).map(([sev, stats]) => [
            sev,
            {
              count: stats.count,
              hours: parseFloat(stats.hours.toFixed(2))
            }
          ])
        )
      })),
      topProblems: top10Global.map(p => ({
        title: p.title || p.displayName,
        severity: p.severityLevel,
        durationHours: parseFloat(p.durationHours.toFixed(2)),
        startTime: p.startTime,
        service: p.affectedEntities?.[0]?.name || 'Unknown'
      })),
      severityDistribution: Object.fromEntries(
        Object.entries(severityGlobal).map(([sev, stats]) => [
          sev,
          {
            count: stats.count,
            hours: parseFloat(stats.hours.toFixed(2))
          }
        ])
      )
    };

    const outputPath = path.resolve(__dirname, '../../../../real_dashboard_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2));
    console.log(`\n✅ Datos guardados en: ${outputPath}\n`);

    return dashboardData;

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

analyzeAllProblems();
