import Stripe from 'stripe';
import pino from 'pino';
import { AppDataSource } from '../../config/database';
import { TenantEntity } from '../../entities/Tenant';
import { tierManager } from '../../config/tiers';
import { GatewayConfigManager } from '../config/GatewayConfigManager';

const logger = pino({
  name: 'gateway:billing-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'month' | 'year';
  features: string[];
  stripePriceId?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  customerId?: string;
  subscriptionId?: string;
}

export interface BillingPortalSession {
  url: string;
}

export class BillingService {
  private static instance: BillingService;
  private stripe: Stripe | null = null;
  private gatewayConfig: GatewayConfigManager;

  private constructor() {
    this.gatewayConfig = GatewayConfigManager.getInstance();
    this.initializeStripe();
  }

  static getInstance(): BillingService {
    if (!BillingService.instance) {
      BillingService.instance = new BillingService();
    }
    return BillingService.instance;
  }

  private initializeStripe(): void {
    const billingConfig = this.gatewayConfig.getBillingConfig();
    
    if (billingConfig.enabled && billingConfig.provider === 'stripe') {
      const secretKey = process.env.STRIPE_SECRET_KEY;
      
      if (!secretKey) {
        logger.warn('Stripe secret key not found, billing will be disabled');
        return;
      }

      this.stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16',
        typescript: true,
      });

      logger.info('Stripe initialized successfully');
    } else {
      logger.info('Billing disabled or using mock provider');
    }
  }

  /**
   * Get available subscription plans
   */
  getPlans(): SubscriptionPlan[] {
    const plans: SubscriptionPlan[] = [
      {
        id: 'starter-monthly',
        name: 'Starter',
        price: 29,
        currency: 'USD',
        interval: 'month',
        features: [
          '10,000 requests/month',
          'PII masking',
          'Custom policies',
          'Email support',
          'Hot-reload policies'
        ],
        stripePriceId: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
      },
      {
        id: 'starter-yearly',
        name: 'Starter',
        price: 290,
        currency: 'USD',
        interval: 'year',
        features: [
          '10,000 requests/month',
          'PII masking',
          'Custom policies',
          'Email support',
          'Hot-reload policies',
          '2 months free'
        ],
        stripePriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID,
      },
      {
        id: 'pro-monthly',
        name: 'Pro',
        price: 99,
        currency: 'USD',
        interval: 'month',
        features: [
          '100,000 requests/month',
          'Risk scoring',
          'Webhooks',
          'Advanced metrics',
          'Priority support',
          'Batch processing'
        ],
        stripePriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      },
      {
        id: 'pro-yearly',
        name: 'Pro',
        price: 990,
        currency: 'USD',
        interval: 'year',
        features: [
          '100,000 requests/month',
          'Risk scoring',
          'Webhooks',
          'Advanced metrics',
          'Priority support',
          'Batch processing',
          '2 months free'
        ],
        stripePriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      },
    ];

    return plans;
  }

  /**
   * Create checkout session for subscription
   */
  async createCheckoutSession(
    tenantId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
    promoCode?: string
  ): Promise<CheckoutSession> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const plan = this.getPlans().find(p => p.id === planId);
    if (!plan || !plan.stripePriceId) {
      throw new Error('Invalid plan or missing Stripe price ID');
    }

    try {
      // Create or get Stripe customer
      let customerId = tenant.stripeCustomerId;
      
      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: tenant.email,
          name: tenant.name,
          metadata: {
            tenantId: tenant.id,
            tier: tenant.tier,
          },
        });
        
        customerId = customer.id;
        
        // Update tenant with Stripe customer ID
        tenant.stripeCustomerId = customerId;
        await AppDataSource.getRepository(TenantEntity).save(tenant);
      }

      // Create checkout session
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: plan.stripePriceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tenantId: tenant.id,
          planId: plan.id,
        },
        subscription_data: {
          metadata: {
            tenantId: tenant.id,
            planId: plan.id,
          },
        },
      };

      // Apply promo code if provided
      if (promoCode) {
        // Special Gramado Summit promo
        if (promoCode === 'GRAMADO2025') {
          sessionParams.discounts = [
            {
              coupon: process.env.STRIPE_GRAMADO_COUPON_ID || 'gramado2025',
            },
          ];
        }
      }

      const session = await this.stripe.checkout.sessions.create(sessionParams);

      logger.info('Checkout session created', {
        tenantId,
        planId,
        sessionId: session.id,
        customerId,
      });

      return {
        id: session.id,
        url: session.url!,
        customerId,
      };

    } catch (error) {
      logger.error('Failed to create checkout session:', error);
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Create billing portal session
   */
  async createBillingPortalSession(
    tenantId: string,
    returnUrl: string
  ): Promise<BillingPortalSession> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    if (!tenant || !tenant.stripeCustomerId) {
      throw new Error('Tenant not found or no Stripe customer');
    }

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: tenant.stripeCustomerId,
        return_url: returnUrl,
      });

      logger.info('Billing portal session created', {
        tenantId,
        customerId: tenant.stripeCustomerId,
      });

      return {
        url: session.url,
      };

    } catch (error) {
      logger.error('Failed to create billing portal session:', error);
      throw new Error('Failed to create billing portal session');
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    logger.info('Processing Stripe webhook', {
      type: event.type,
      id: event.id,
    });

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        default:
          logger.info('Unhandled webhook event type', { type: event.type });
      }
    } catch (error) {
      logger.error('Failed to process webhook:', error);
      throw error;
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const tenantId = session.metadata?.tenantId;
    const planId = session.metadata?.planId;

    if (!tenantId || !planId) {
      logger.error('Missing metadata in checkout session', { sessionId: session.id });
      return;
    }

    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    if (!tenant) {
      logger.error('Tenant not found for checkout session', { tenantId, sessionId: session.id });
      return;
    }

    // Update tenant tier based on plan
    const newTier = planId.startsWith('starter') ? 'starter' : 'pro';
    const tierConfig = tierManager.getTierConfig(newTier);

    tenant.tier = newTier;
    tenant.monthlyQuota = tierConfig.monthlyQuota;
    tenant.stripeSubscriptionId = session.subscription as string;
    tenant.subscriptionStatus = 'active';
    tenant.tierUpdatedAt = new Date();

    await AppDataSource.getRepository(TenantEntity).save(tenant);

    logger.info('Tenant upgraded after checkout', {
      tenantId,
      newTier,
      subscriptionId: session.subscription,
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;

    if (!tenantId) {
      logger.error('Missing tenantId in subscription metadata', { subscriptionId: subscription.id });
      return;
    }

    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    if (!tenant) {
      logger.error('Tenant not found for subscription', { tenantId, subscriptionId: subscription.id });
      return;
    }

    tenant.subscriptionStatus = subscription.status;
    tenant.stripeSubscriptionId = subscription.id;

    // Handle subscription status changes
    if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
      // Downgrade to free tier
      tenant.tier = 'free';
      tenant.monthlyQuota = tierManager.getTierConfig('free').monthlyQuota;
      tenant.tierUpdatedAt = new Date();
    }

    await AppDataSource.getRepository(TenantEntity).save(tenant);

    logger.info('Subscription updated', {
      tenantId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const tenantId = subscription.metadata?.tenantId;

    if (!tenantId) {
      logger.error('Missing tenantId in subscription metadata', { subscriptionId: subscription.id });
      return;
    }

    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    if (!tenant) {
      logger.error('Tenant not found for subscription', { tenantId, subscriptionId: subscription.id });
      return;
    }

    // Downgrade to free tier
    tenant.tier = 'free';
    tenant.monthlyQuota = tierManager.getTierConfig('free').monthlyQuota;
    tenant.subscriptionStatus = 'canceled';
    tenant.tierUpdatedAt = new Date();

    await AppDataSource.getRepository(TenantEntity).save(tenant);

    logger.info('Subscription deleted, tenant downgraded', {
      tenantId,
      subscriptionId: subscription.id,
    });
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    logger.info('Payment succeeded', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amount: invoice.amount_paid,
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    logger.warn('Payment failed', {
      invoiceId: invoice.id,
      customerId: invoice.customer,
      amount: invoice.amount_due,
    });

    // Could implement retry logic or notifications here
  }

  /**
   * Get subscription status for tenant
   */
  async getSubscriptionStatus(tenantId: string): Promise<any> {
    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (!tenant.stripeSubscriptionId || !this.stripe) {
      return {
        tier: tenant.tier,
        status: 'free',
        subscription: null,
      };
    }

    try {
      const subscription = await this.stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      
      return {
        tier: tenant.tier,
        status: subscription.status,
        subscription: {
          id: subscription.id,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
      };
    } catch (error) {
      logger.error('Failed to get subscription status:', error);
      return {
        tier: tenant.tier,
        status: 'unknown',
        subscription: null,
      };
    }
  }
}
