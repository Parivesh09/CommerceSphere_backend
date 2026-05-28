import { Router, Request, Response } from 'express';
import { notificationService } from './notification.service';
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'notification-service' });
const router = Router();


router.get('/preferences/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const preferences = await notificationService.getUserPreferences(userId);
    
    res.json(preferences);
  } catch (error) {
    logger.error('Failed to get notification preferences', {
      userId: req.params.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification preferences',
      },
    });
  }
});


router.put('/preferences/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { emailEnabled, smsEnabled, pushEnabled } = req.body;
    
    const preferences = await notificationService.updateUserPreferences(userId, {
      emailEnabled,
      smsEnabled,
      pushEnabled,
    });
    
    res.json(preferences);
  } catch (error) {
    logger.error('Failed to update notification preferences', {
      userId: req.params.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update notification preferences',
      },
    });
  }
});


router.get('/history/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const notifications = await notificationService.getNotificationHistory(userId, limit);
    
    res.json({
      notifications,
      count: notifications.length,
    });
  } catch (error) {
    logger.error('Failed to get notification history', {
      userId: req.params.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get notification history',
      },
    });
  }
});

export default router;
