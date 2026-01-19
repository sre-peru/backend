/**
 * Main Routes Index
 */
import { Router } from 'express';
import authRoutes from './auth.routes';
import problemRoutes from './problem.routes';
import analyticsRoutes from './analytics.routes';
import filterRoutes from './filter.routes';
import falsePositivesRoutes from './false-positives.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/problems', problemRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/filters', filterRoutes);
router.use('/false-positives', falsePositivesRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
