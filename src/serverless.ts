/**
 * Vercel Serverless Function Entry Point
 */
import { createApp } from './app';
import { database } from './config/database';

// Initialize database connection (reused across invocations)
let isConnected = false;

const initDatabase = async () => {
  if (!isConnected) {
    try {
      await database.connect();
      isConnected = true;
      console.log('✅ Database connected for serverless function');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }
};

// Create Express app
const app = createApp();

// Vercel expects a default export that handles requests
export default async (req: any, res: any) => {
  try {
    // Ensure database is connected
    await initDatabase();
    
    // Handle the request with Express
    return app(req, res);
  } catch (error) {
    console.error('❌ Serverless function error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An error occurred processing your request',
    });
  }
};
