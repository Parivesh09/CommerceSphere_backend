import { Router, Request, Response, NextFunction } from 'express';
import { validateRequest } from '@commercesphere/utils';
import { AuthService } from './auth.service';
import { authenticate } from './middleware';
import {
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  PasswordResetRequest,
  PasswordResetComplete,
} from './types';

const router = Router();
const authService = new AuthService();


router.post('/register',
  validateRequest({
    body: [
      { field: 'email', type: 'email', required: true, sanitize: true },
      { field: 'password', type: 'string', required: true, minLength: 8, maxLength: 128 },
      { field: 'name', type: 'string', required: true, sanitize: true, minLength: 1, maxLength: 255 },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: RegisterRequest = req.body;
      const user = await authService.register(data);
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  }
);


router.post('/login',
  validateRequest({
    body: [
      { field: 'email', type: 'email', required: true, sanitize: true },
      { field: 'password', type: 'string', required: true },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: LoginRequest = req.body;
      const result = await authService.login(data);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);


router.post('/refresh',
  validateRequest({
    body: [
      { field: 'refreshToken', type: 'string', required: true },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: RefreshTokenRequest = req.body;
      const result = await authService.refreshAccessToken(data);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
);


router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});


router.post('/password-reset-request',
  validateRequest({
    body: [
      { field: 'email', type: 'email', required: true, sanitize: true },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: PasswordResetRequest = req.body;
      await authService.requestPasswordReset(data);
      res.status(200).json({ message: 'Password reset email sent' });
    } catch (error) {
      next(error);
    }
  }
);


router.post('/password-reset',
  validateRequest({
    body: [
      { field: 'token', type: 'string', required: true },
      { field: 'newPassword', type: 'string', required: true, minLength: 8, maxLength: 128 },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data: PasswordResetComplete = req.body;
      await authService.completePasswordReset(data);
      res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
      next(error);
    }
  }
);


router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new Error('User not authenticated');
    }
    const user = await authService.getUserById(req.user.sub);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});

export default router;
