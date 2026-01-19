/**
 * MongoDB Database Configuration
 */
import { MongoClient, Db } from 'mongodb';

export interface MongoDBConfig {
  connectionString: string;
  databaseName: string;
  collectionName: string;
}

class DatabaseConnection {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoDBConfig;

  constructor() {
    this.config = {
      connectionString: process.env.MONGODB_URI || '',
      databaseName: process.env.MONGODB_DB_NAME || 'problemas-dynatrace-uno',
      collectionName: process.env.MONGODB_COLLECTION_NAME || 'problems',
    };
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      if (this.client) {
        console.log('✅ Already connected to MongoDB');
        return;
      }

      console.log('🔄 Connecting to MongoDB Atlas...');
      
      // MongoDB connection options with extended timeouts
      const options = {
        serverSelectionTimeoutMS: 60000, // 60 seconds
        socketTimeoutMS: 60000, // 60 seconds
        connectTimeoutMS: 60000, // 60 seconds
        maxPoolSize: 10,
        minPoolSize: 2,
        retryWrites: true,
        retryReads: true,
        maxIdleTimeMS: 300000, // 5 minutes
      };

      this.client = new MongoClient(this.config.connectionString, options);
      await this.client.connect();
      this.db = this.client.db(this.config.databaseName);

      // Verify connection with a ping
      await this.db.admin().ping();

      // Create indexes for optimized queries
      await this.createIndexes();

      console.log('✅ Successfully connected to MongoDB Atlas');
      console.log(`📊 Database: ${this.config.databaseName}`);
      console.log(`📁 Collection: ${this.config.collectionName}`);
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      console.error('💡 Tip: Verifica que tu IP esté autorizada en MongoDB Atlas');
      console.error('💡 Tip: Verifica las credenciales en el archivo .env');
      throw error;
    }
  }

  /**
   * Create optimized indexes
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) return;

    const collection = this.db.collection(this.config.collectionName);

    try {
      // Compound index for filtering
      await collection.createIndex({
        impactLevel: 1,
        severityLevel: 1,
        status: 1,
      });

      // Index for time-based queries
      await collection.createIndex({ startTime: -1 });

      // Index for management zones
      await collection.createIndex({ 'managementZones.name': 1 });

      // Text index for search
      await collection.createIndex({
        title: 'text',
        displayId: 'text',
        'recentComments.comments.content': 'text',
      });

      // Additional indexes for analytics performance
      await collection.createIndex({ duration: 1 });
      await collection.createIndex({ Autoremediado: 1 });
      await collection.createIndex({ 'affectedEntities.entityId.id': 1 });
      await collection.createIndex({ 'affectedEntities.entityId.type': 1 });
      
      // Compound indexes for common query patterns
      await collection.createIndex({ startTime: -1, status: 1 });
      await collection.createIndex({ severityLevel: 1, startTime: -1 });
      await collection.createIndex({ Autoremediado: 1, FuncionoAutoRemediacion: 1 });

      console.log('✅ Database indexes created successfully');
    } catch (error) {
      console.warn('⚠️  Index creation warning:', error);
    }
  }

  /**
   * Get database instance
   */
  getDb(): Db {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Get collection
   */
  getCollection(name?: string) {
    const collectionName = name || this.config.collectionName;
    return this.getDb().collection(collectionName);
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('✅ MongoDB connection closed');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }
}

// Singleton instance
export const database = new DatabaseConnection();

/**
 * Helper function to get database instance
 * Compatible with services that use getDatabase() import
 */
export function getDatabase(): Db {
  return database.getDb();
}
