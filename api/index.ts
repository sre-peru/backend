/**
 * Vercel Serverless Function Entry Point
 */
import { createApp } from '../src/app';
import { database } from '../src/config/database';
import type { VercelRequest, VercelResponse } from '@vercel/node';

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

// Vercel serverless function handler
export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    // Ensure database is connected
    await initDatabase();
    
    // Handle the request with Express
    // @ts-ignore - Express types are compatible with Vercel types
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
