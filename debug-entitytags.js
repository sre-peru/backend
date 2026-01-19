const { MongoClient } = require('mongodb');

async function debugEntityTags() {
  const uri = "mongodb+srv://raguerreromauriola_db_user:fOWhYmM9ey4PwSRs@scraping.0robens.mongodb.net/?retryWrites=true&w=majority&appName=scraping";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('problemas-dynatrace-uno');
    const collection = db.collection('problems');

    // Buscar TODOS los problemas sin filtro de fecha
    console.log('🔍 Buscando TODOS los problemas (sin filtro de fecha)');
    
    const problems = await collection.find({}).limit(5).toArray();

    console.log(`📊 Encontrados ${problems.length} problemas en sep-oct-nov`);

    problems.forEach((problem, index) => {
      console.log(`\n🔍 Problema ${index + 1}:`, {
        id: problem.displayId,
        startTime: problem.startTime,
        hasEntityTags: !!problem.entityTags,
        entityTagsCount: problem.entityTags?.length || 0
      });

      if (problem.entityTags && Array.isArray(problem.entityTags)) {
        problem.entityTags.forEach((tag, tagIndex) => {
          console.log(`  🏷️ Tag ${tagIndex + 1}:`, {
            key: tag.key,
            stringRepresentation: tag.stringRepresentation,
            prefix: tag.key?.split('-')[0]
          });
        });
      }
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

debugEntityTags();
