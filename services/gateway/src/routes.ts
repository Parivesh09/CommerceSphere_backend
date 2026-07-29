import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from './config';
import {
  jwtValidationMiddleware,
  optionalJwtValidationMiddleware,
} from './middleware';
import { AuthenticatedRequest } from './types';

export const router = Router();

/**
 * Route configuration
 * Maps path prefixes to backend services and authentication requirements
 */
const routes = [

  {
    path: '/auth',
    target: config.services.auth,
    requiresAuth: false,
  },

  {
    path: '/products',
    target: config.services.product,
    requiresAuth: false, // Will use optional auth
  },

  {
    path: '/categories',
    target: config.services.product,
    requiresAuth: false,
  },

  {
    path: '/variants',
    target: config.services.product,
    requiresAuth: false,
  },

  {
    path: '/images',
    target: config.services.product,
    requiresAuth: false,
  },

  {
    path: '/inventory',
    target: config.services.product,
    requiresAuth: true,
  },

  {
    path: '/orders',
    target: config.services.order,
    requiresAuth: true,
  },

  {
    path: '/payments',
    target: config.services.payment,
    requiresAuth: true,
  },

  {
    path: '/notifications',
    target: config.services.notification,
    requiresAuth: true,
  },

  {
    path: '/search',
    target: config.services.search,
    requiresAuth: false,
  },

  {
    path: '/recommendations',
    target: config.services.recommendation,
    requiresAuth: false, // Will use optional auth
  },

  {
    path: '/analytics',
    target: config.services.analytics,
    requiresAuth: true,
  },

  {
    path: '/cart',
    target: config.services.cart,
    requiresAuth: true,
  },
];

/**
 * Configure proxy routes
 */
routes.forEach((route) => {
  // Custom path rewrite for services that mount routes at a different prefix
  const pathRewrite: Record<string, string> = {};
  if (route.path === '/recommendations') {
    // Recommendation service (FastAPI) mounts routes under /api prefix
    pathRewrite['^/recommendations'] = '/api/recommendations';
  } else {
    pathRewrite[`^${route.path}`] = route.path;
  }

  const proxyMiddleware = createProxyMiddleware({
    target: route.target,
    changeOrigin: true,
    timeout: 30000,
    proxyTimeout: 30000,
    pathRewrite,
    logLevel: 'debug',
    onProxyReq: (proxyReq, req: any) => {
      // Forward correlation ID
      if (req.correlationId) {
        proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      }

      // Forward user information from JWT
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.sub);
        proxyReq.setHeader('X-User-Email', req.user.email);
        proxyReq.setHeader('X-User-Role', req.user.role);
      }
      
      // Fix body forwarding for POST/PUT/PATCH requests
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },
    onError: (err, req: any, res: any) => {
      const authReq = req as AuthenticatedRequest;
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The requested service is temporarily unavailable',
          timestamp: new Date().toISOString(),
          path: authReq.path,
          correlationId: authReq.correlationId,
        },
      });
    },
  });

  // Mount each proxy at its specific path with appropriate auth middleware
  if (route.requiresAuth) {
    router.use(route.path, jwtValidationMiddleware, proxyMiddleware);
  } else if (
    route.path === '/products' ||
    route.path === '/recommendations' ||
    route.path === '/categories' ||
    route.path === '/variants' ||
    route.path === '/images'
  ) {
    router.use(route.path, optionalJwtValidationMiddleware, proxyMiddleware);
  } else {
    router.use(route.path, proxyMiddleware);
  }
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'api-gateway',
  });
});

/**
 * Catch-all for undefined routes
 */
router.use('*', (req: AuthenticatedRequest, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
      timestamp: new Date().toISOString(),
      path: req.path,
      correlationId: req.correlationId,
    },
  });
});
