/**
 * Complete Data Extraction and Dashboard Population
 * Extracts REAL data from MongoDB and generates comprehensive report
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

async function extractCompleteData() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Conectado a MongoDB\n');

    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    // Extraer TODOS los problemas de Sep-Nov 2025
    const problems = await collection.find({
      startTime: {
        $gte: new Date('2025-09-01T00:00:00Z'),
        $lt: new Date('2025-12-01T00:00:00Z')
      }
    }).toArray() as unknown as Problem[];

    console.log(`📊 Total de problemas encontrados: ${problems.length}\n`);

    if (problems.length === 0) {
      console.log('⚠️  No se encontraron problemas en el rango Sep-Nov 2025');
      console.log('💡 Buscando en todo el año 2025...\n');
      
      const allProblems2025 = await collection.find({
        startTime: {
          $gte: new Date('2025-01-01T00:00:00Z'),
          $lt: new Date('2026-01-01T00:00:00Z')
        }
      }).toArray() as unknown as Problem[];
      
      console.log(`📊 Problemas en todo 2025: ${allProblems2025.length}`);
      
      if (allProblems2025.length > 0) {
        console.log('\n🔍 Usando datos de todo 2025 para el análisis...\n');
        return analyzeProblems(allProblems2025);
      }
    }

    return analyzeProblems(problems);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

function analyzeProblems(problems: Problem[]) {
  // Calcular duración para cada problema
  const problemsWithDuration = problems.map(p => {
    const start = new Date(p.startTime).getTime();
    const end = new Date(p.endTime).getTime();
    const durationMs = end - start;
    const durationHours = durationMs / 3600000;
    const durationMinutes = durationMs / 60000;

    return {
      ...p,
      durationMs,
      durationHours,
      durationMinutes,
      month: new Date(p.startTime).getMonth() + 1
    };
  });

  // TOP 10 PROBLEMAS MÁS LARGOS
  const top10 = problemsWithDuration
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  console.log('🏆 TOP 10 PROBLEMAS MÁS LARGOS:\n');
  console.log('═'.repeat(120));
  
  top10.forEach((p, i) => {
    const service = p.affectedEntities?.[0]?.name || 'Unknown';
    const title = (p.title || p.displayName || 'Sin título').substring(0, 60);
    
    console.log(`${(i + 1).toString().padStart(2, ' ')}. ${title.padEnd(62)} | ${service.padEnd(20)} | ${p.severityLevel.padEnd(15)} | ${p.durationHours.toFixed(2).padStart(8)} h`);
  });
  console.log('═'.repeat(120));

  // RESUMEN MENSUAL
  const monthlyData: Record<number, {
    name: string;
    problems: number;
    totalHours: number;
    bySeverity: Record<string, { count: number; hours: number }>;
    topProblem: any;
  }> = {};

  const monthNames: Record<number, string> = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
    5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
    9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
  };

  problemsWithDuration.forEach(p => {
    if (!monthlyData[p.month]) {
      monthlyData[p.month] = {
        name: monthNames[p.month],
        problems: 0,
        totalHours: 0,
        bySeverity: {},
        topProblem: null
      };
    }

    const month = monthlyData[p.month];
    month.problems++;
    month.totalHours += p.durationHours;

    // Por severidad
    if (!month.bySeverity[p.severityLevel]) {
      month.bySeverity[p.severityLevel] = { count: 0, hours: 0 };
    }
    month.bySeverity[p.severityLevel].count++;
    month.bySeverity[p.severityLevel].hours += p.durationHours;

    // Top problem del mes
    if (!month.topProblem || p.durationHours > month.topProblem.durationHours) {
      month.topProblem = p;
    }
  });

  console.log('\n\n📅 RESUMEN MENSUAL DETALLADO:\n');
  console.log('═'.repeat(120));

  Object.entries(monthlyData)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([monthNum, data]) => {
      const monthHours = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][parseInt(monthNum) - 1] * 24;
      const downtimePercent = (data.totalHours / monthHours) * 100;

      console.log(`\n🗓️  ${data.name.toUpperCase()} 2025`);
      console.log('─'.repeat(120));
      console.log(`   📊 Problemas: ${data.problems}`);
      console.log(`   ⏱️  Horas de Indisponibilidad: ${data.totalHours.toFixed(2)} h`);
      console.log(`   📉 Downtime: ${downtimePercent.toFixed(3)}%`);
      console.log(`   ⚡ MTTR Promedio: ${(data.totalHours / data.problems * 60).toFixed(1)} minutos`);
      
      console.log(`\n   🎯 Distribución por Severidad:`);
      Object.entries(data.bySeverity)
        .sort(([, a], [, b]) => b.hours - a.hours)
        .forEach(([severity, stats]) => {
          const percent = (stats.hours / data.totalHours * 100).toFixed(1);
          console.log(`      • ${severity.padEnd(20)}: ${stats.count.toString().padStart(3)} problemas | ${stats.hours.toFixed(2).padStart(8)} h (${percent}%)`);
        });

      if (data.topProblem) {
        const title = (data.topProblem.title || data.topProblem.displayName || 'Sin título').substring(0, 70);
        console.log(`\n   🔥 Problema Más Largo del Mes:`);
        console.log(`      "${title}"`);
        console.log(`      Duración: ${data.topProblem.durationHours.toFixed(2)} h | Severidad: ${data.topProblem.severityLevel}`);
      }
    });

  console.log('\n' + '═'.repeat(120));

  // ESTADÍSTICAS GLOBALES
  const totalHours = problemsWithDuration.reduce((sum, p) => sum + p.durationHours, 0);
  const avgDuration = totalHours / problems.length;
  
  const severityGlobal: Record<string, { count: number; hours: number }> = {};
  problemsWithDuration.forEach(p => {
    if (!severityGlobal[p.severityLevel]) {
      severityGlobal[p.severityLevel] = { count: 0, hours: 0 };
    }
    severityGlobal[p.severityLevel].count++;
    severityGlobal[p.severityLevel].hours += p.durationHours;
  });

  console.log('\n\n📊 ESTADÍSTICAS GLOBALES:\n');
  console.log('═'.repeat(120));
  console.log(`   Total de Problemas: ${problems.length}`);
  console.log(`   Total Horas de Indisponibilidad: ${totalHours.toFixed(2)} h`);
  console.log(`   Duración Promedio: ${avgDuration.toFixed(2)} h (${(avgDuration * 60).toFixed(1)} min)`);
  console.log(`   Problema Más Largo: ${top10[0].durationHours.toFixed(2)} h`);
  console.log(`   Problema Más Corto: ${problemsWithDuration[problemsWithDuration.length - 1].durationHours.toFixed(4)} h`);
  
  console.log(`\n   🎯 Severidad Más Común:`);
  Object.entries(severityGlobal)
    .sort(([, a], [, b]) => b.count - a.count)
    .forEach(([severity, stats]) => {
      const percent = (stats.count / problems.length * 100).toFixed(1);
      console.log(`      • ${severity.padEnd(20)}: ${stats.count.toString().padStart(4)} (${percent}%)`);
    });

  console.log('\n' + '═'.repeat(120));

  // Generar JSON para el dashboard
  const dashboardData = {
    totalProblems: problems.length,
    totalHours: parseFloat(totalHours.toFixed(2)),
    monthlySummary: Object.entries(monthlyData).map(([month, data]) => ({
      month: `2025-${month.padStart(2, '0')}`,
      name: data.name,
      problems: data.problems,
      hours: parseFloat(data.totalHours.toFixed(2)),
      bySeverity: data.bySeverity
    })),
    topProblems: top10.map(p => ({
      title: p.title || p.displayName,
      severity: p.severityLevel,
      durationHours: parseFloat(p.durationHours.toFixed(2)),
      startTime: p.startTime,
      service: p.affectedEntities?.[0]?.name || 'Unknown'
    })),
    severityDistribution: severityGlobal
  };

  const outputPath = path.resolve(__dirname, '../../../../dashboard_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(dashboardData, null, 2));
  console.log(`\n✅ Datos guardados en: ${outputPath}\n`);

  return dashboardData;
}

extractCompleteData();
