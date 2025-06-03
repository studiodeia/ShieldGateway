import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';
import Stripe from 'stripe';
import { authMiddleware } from '../../middleware/auth';
import { BillingService } from '../services/BillingService';
import { GatewayConfigManager } from '../config/GatewayConfigManager';

const logger = pino({
  name: 'gateway:billing-routes',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();
const billingService = BillingService.getInstance();
const gatewayConfig = GatewayConfigManager.getInstance();

// Validation schemas
const CheckoutRequestSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  interval: z.enum(['month', 'year']).default('month'),
  promoCode: z.string().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * GET /billing/plans
 * Get available subscription plans
 */
router.get('/plans', (req: Request, res: Response) => {
  try {
    const plans = billingService.getPlans();
    
    res.json({
      plans: plans.map(plan => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        interval: plan.interval,
        features: plan.features,
        savings: plan.interval === 'year' ? 
          Math.round(((plan.price / 12) - (plan.price / 10)) / (plan.price / 12) * 100) : 0,
      })),
      currency: 'USD',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get billing plans:', error);
    res.status(500).json({
      error: 'Failed to retrieve billing plans',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /billing/checkout
 * Create checkout session for subscription
 */
router.post('/checkout',
  authMiddleware.authenticate,
  async (req: Request, res: Response) => {
    try {
      const billingConfig = gatewayConfig.getBillingConfig();
      
      if (!billingConfig.enabled) {
        return res.status(503).json({
          error: 'Billing is currently disabled',
          timestamp: new Date().toISOString(),
        });
      }

      const checkoutRequest = CheckoutRequestSchema.parse(req.body);
      const tenantId = req.auth?.tenantId;

      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
          timestamp: new Date().toISOString(),
        });
      }

      // Default URLs
      const baseUrl = process.env.FRONTEND_URL || 'https://gateway.guardagent.io';
      const successUrl = checkoutRequest.successUrl || `${baseUrl}/dashboard?checkout=success`;
      const cancelUrl = checkoutRequest.cancelUrl || `${baseUrl}/pricing?checkout=canceled`;

      const session = await billingService.createCheckoutSession(
        tenantId,
        checkoutRequest.planId,
        successUrl,
        cancelUrl,
        checkoutRequest.promoCode
      );

      logger.info('Checkout session created', {
        tenantId,
        planId: checkoutRequest.planId,
        sessionId: session.id,
        promoCode: checkoutRequest.promoCode,
      });

      res.json({
        sessionId: session.id,
        url: session.url,
        message: 'Checkout session created successfully',
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid checkout request',
          details: error.errors,
          timestamp: new Date().toISOString(),
        });
      }

      logger.error('Failed to create checkout session:', error);
      res.status(500).json({
        error: 'Failed to create checkout session',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /billing/portal
 * Create billing portal session
 */
router.post('/portal',
  authMiddleware.authenticate,
  async (req: Request, res: Response) => {
    try {
      const billingConfig = gatewayConfig.getBillingConfig();
      
      if (!billingConfig.enabled) {
        return res.status(503).json({
          error: 'Billing is currently disabled',
          timestamp: new Date().toISOString(),
        });
      }

      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
          timestamp: new Date().toISOString(),
        });
      }

      const baseUrl = process.env.FRONTEND_URL || 'https://gateway.guardagent.io';
      const returnUrl = req.body.returnUrl || `${baseUrl}/dashboard`;

      const session = await billingService.createBillingPortalSession(tenantId, returnUrl);

      logger.info('Billing portal session created', {
        tenantId,
      });

      res.json({
        url: session.url,
        message: 'Billing portal session created successfully',
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to create billing portal session:', error);
      res.status(500).json({
        error: 'Failed to create billing portal session',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /billing/subscription
 * Get current subscription status
 */
router.get('/subscription',
  authMiddleware.authenticate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
          timestamp: new Date().toISOString(),
        });
      }

      const subscriptionStatus = await billingService.getSubscriptionStatus(tenantId);

      res.json({
        ...subscriptionStatus,
        billingEnabled: gatewayConfig.getBillingConfig().enabled,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to get subscription status:', error);
      res.status(500).json({
        error: 'Failed to retrieve subscription status',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /billing/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const billingConfig = gatewayConfig.getBillingConfig();
    
    if (!billingConfig.enabled || billingConfig.provider !== 'stripe') {
      return res.status(400).json({
        error: 'Stripe webhooks not enabled',
      });
    }

    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('Stripe webhook secret not configured');
      return res.status(500).json({
        error: 'Webhook secret not configured',
      });
    }

    let event: Stripe.Event;

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2023-10-16',
      });
      
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      return res.status(400).json({
        error: 'Webhook signature verification failed',
      });
    }

    // Handle the event
    await billingService.handleWebhook(event);

    logger.info('Webhook processed successfully', {
      type: event.type,
      id: event.id,
    });

    res.json({ received: true });

  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(500).json({
      error: 'Webhook processing failed',
    });
  }
});

/**
 * GET /billing/promo/:code
 * Validate promo code
 */
router.get('/promo/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    
    // Special Gramado Summit promo
    if (code === 'GRAMADO2025') {
      res.json({
        valid: true,
        code: 'GRAMADO2025',
        description: 'Gramado Summit Special: 3 months free Starter tier',
        discount: {
          type: 'months_free',
          value: 3,
          appliesTo: ['starter-monthly', 'starter-yearly'],
        },
        expiresAt: '2025-01-31T23:59:59Z',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Other promo codes can be added here
    res.json({
      valid: false,
      code,
      message: 'Promo code not found or expired',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to validate promo code:', error);
    res.status(500).json({
      error: 'Failed to validate promo code',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /billing/upgrade-suggestion
 * Get upgrade suggestion based on usage
 */
router.post('/upgrade-suggestion',
  authMiddleware.authenticate,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.auth?.tenantId;
      const currentUsage = req.body.currentUsage || 0;
      const currentTier = req.auth?.tenant?.tier || 'free';

      if (!tenantId) {
        return res.status(401).json({
          error: 'Unauthorized',
          timestamp: new Date().toISOString(),
        });
      }

      let suggestion = null;

      // Logic for upgrade suggestions
      if (currentTier === 'free' && currentUsage > 800) {
        suggestion = {
          recommendedTier: 'starter',
          reason: 'You\'re approaching your monthly quota limit',
          benefits: [
            '10x more requests (10,000/month)',
            'PII masking',
            'Custom policies',
            'Email support'
          ],
          urgency: 'high',
        };
      } else if (currentTier === 'starter' && currentUsage > 8000) {
        suggestion = {
          recommendedTier: 'pro',
          reason: 'You\'re approaching your monthly quota limit',
          benefits: [
            '10x more requests (100,000/month)',
            'Risk scoring',
            'Webhooks',
            'Advanced metrics',
            'Priority support'
          ],
          urgency: 'high',
        };
      }

      res.json({
        currentTier,
        currentUsage,
        suggestion,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error('Failed to get upgrade suggestion:', error);
      res.status(500).json({
        error: 'Failed to get upgrade suggestion',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

export { router as billingRouter };
