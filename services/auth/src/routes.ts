import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { validateRequest } from '@commercesphere/utils';
import { AuthService } from './auth.service';
import { authenticate } from './middleware';
import {
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  PasswordResetRequest,
  PasswordResetComplete,
  UpdateProfileRequest,
  ChangePasswordRequest,
  CreateAddressRequest,
} from './types';

const router = Router();
const authService = new AuthService();

const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads/avatars'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, jpeg, png, gif, webp) are allowed'));
    }
  },
});


router.post('/register',
  validateRequest({
    body: [
      { field: 'email', type: 'email', required: true, sanitize: true },
      { field: 'password', type: 'string', required: true, minLength: 8, maxLength: 128 },
      { field: 'name', type: 'string', required: true, sanitize: true, minLength: 1, maxLength: 255 },
      { field: 'role', type: 'string', required: false, minLength: 1, maxLength: 20 },
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

router.patch('/me', authenticate,
  validateRequest({
    body: [
      { field: 'name', type: 'string', required: false, sanitize: true, minLength: 1, maxLength: 255 },
      { field: 'email', type: 'email', required: false, sanitize: true },
      { field: 'phone', type: 'string', required: false, minLength: 7, maxLength: 20 },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const data: UpdateProfileRequest = req.body;
      const user = await authService.updateProfile(req.user.sub, data);
      res.status(200).json({ user });
    } catch (error) {
      next(error);
    }
  }
);

router.put('/me/password', authenticate,
  validateRequest({
    body: [
      { field: 'currentPassword', type: 'string', required: true },
      { field: 'newPassword', type: 'string', required: true, minLength: 8, maxLength: 128 },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const data: ChangePasswordRequest = req.body;
      await authService.changePassword(req.user.sub, data);
      res.status(200).json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/me/avatar', authenticate, upload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    if (!req.file) throw new Error('No file uploaded');
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await authService.updateAvatar(req.user.sub, avatarUrl);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});

router.get('/me/addresses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const addresses = await authService.getAddresses(req.user.sub);
    res.status(200).json({ addresses });
  } catch (error) {
    next(error);
  }
});

router.post('/me/addresses', authenticate,
  validateRequest({
    body: [
      { field: 'label', type: 'string', required: false, sanitize: true, maxLength: 100 },
      { field: 'street', type: 'string', required: true, sanitize: true, maxLength: 255 },
      { field: 'city', type: 'string', required: true, sanitize: true, maxLength: 100 },
      { field: 'state', type: 'string', required: true, sanitize: true, maxLength: 100 },
      { field: 'postalCode', type: 'string', required: true, sanitize: true, maxLength: 20 },
      { field: 'country', type: 'string', required: true, sanitize: true, maxLength: 100 },
      { field: 'phone', type: 'string', required: false, maxLength: 20 },
    ]
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) throw new Error('User not authenticated');
      const data: CreateAddressRequest = req.body;
      const address = await authService.createAddress(req.user.sub, data);
      res.status(201).json({ address });
    } catch (error) {
      next(error);
    }
  }
);

router.patch('/me/addresses/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const address = await authService.updateAddress(req.params.id, req.user.sub, req.body);
    res.status(200).json({ address });
  } catch (error) {
    next(error);
  }
});

router.delete('/me/addresses/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    await authService.deleteAddress(req.params.id, req.user.sub);
    res.status(200).json({ message: 'Address deleted successfully' });
  } catch (error) {
    next(error);
  }
});

router.put('/me/addresses/:id/default', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) throw new Error('User not authenticated');
    const address = await authService.setDefaultAddress(req.params.id, req.user.sub);
    res.status(200).json({ address });
  } catch (error) {
    next(error);
  }
});

export default router;
