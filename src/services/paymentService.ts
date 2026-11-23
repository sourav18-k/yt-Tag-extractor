import { auth } from '../lib/firebase';
import type {
  PaymentConfigStatus,
  RazorpayCreateOrderResponse,
  VerifiedEntitlementResponse,
} from '../types/video';

interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayWindow extends Window {
  Razorpay?: new (options: RazorpayCheckoutOptions) => {
    open: () => void;
    on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
  };
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayCheckoutScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout requires a browser environment.'));
  }
  if ((window as RazorpayWindow).Razorpay) {
    return Promise.resolve();
  }
  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error('Failed to load Razorpay Checkout SDK. Check your internet connection.'));
    };
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

export async function fetchPaymentConfig(): Promise<PaymentConfigStatus> {
  const res = await fetch('/api/payments/config', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Unable to load payment configuration.');
  }
  return (await res.json()) as PaymentConfigStatus;
}

export async function fetchVerifiedEntitlement(): Promise<VerifiedEntitlementResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      isPremium: false,
      plan: null,
      status: 'none',
      provider: null,
      expiresAt: null,
    };
  }
  const idToken = await currentUser.getIdToken();
  const res = await fetch('/api/payments/entitlement', {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    return {
      isPremium: false,
      plan: null,
      status: 'none',
      provider: null,
      expiresAt: null,
    };
  }
  return (await res.json()) as VerifiedEntitlementResponse;
}

export async function startRazorpayPremiumCheckout(
  plan: 'monthly' | 'annual'
): Promise<VerifiedEntitlementResponse> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Sign in with your ClipLens account (menu top-right) before upgrading to Premium.');
  }
  if (!currentUser.emailVerified) {
    throw new Error('Verify your email address before completing a subscription payment.');
  }

  const idToken = await currentUser.getIdToken();

  const orderRes = await fetch('/api/payments/razorpay/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ plan }),
  });

  const orderPayload = (await orderRes.json().catch(() => ({}))) as Partial<RazorpayCreateOrderResponse> & {
    error?: string;
  };
  if (!orderRes.ok || !orderPayload.orderId || !orderPayload.keyId) {
    throw new Error(
      orderPayload.error || 'Payment gateway unavailable. Unable to initialize Razorpay order.'
    );
  }

  await loadRazorpayCheckoutScript();
  const RazorpayCtor = (window as RazorpayWindow).Razorpay;
  if (!RazorpayCtor) {
    throw new Error('Razorpay Checkout SDK did not initialize.');
  }

  return new Promise<VerifiedEntitlementResponse>((resolve, reject) => {
    let settled = false;

    const rzp = new RazorpayCtor({
      key: orderPayload.keyId!,
      amount: orderPayload.amountPaise!,
      currency: orderPayload.currency!,
      name: 'ClipLens Premium',
      description:
        plan === 'annual'
          ? 'ClipLens Premium Annual Plan (₹3,299/yr)'
          : 'ClipLens Premium Monthly Plan (₹399/mo)',
      order_id: orderPayload.orderId!,
      prefill: {
        name: currentUser.displayName || undefined,
        email: currentUser.email || undefined,
      },
      theme: {
        color: '#10B981',
      },
      handler: (paymentResponse) => {
        void (async () => {
          try {
            const freshToken = await currentUser.getIdToken();
            const verifyRes = await fetch('/api/payments/razorpay/verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${freshToken}`,
              },
              body: JSON.stringify(paymentResponse),
            });
            const verifyPayload = (await verifyRes.json().catch(() => ({}))) as Partial<VerifiedEntitlementResponse> & {
              error?: string;
            };
            if (!verifyRes.ok || !verifyPayload.isPremium) {
              throw new Error(
                verifyPayload.error || 'Server payment verification failed. Premium remains locked.'
              );
            }
            settled = true;
            resolve(verifyPayload as VerifiedEntitlementResponse);
          } catch (err) {
            settled = true;
            reject(
              err instanceof Error
                ? err
                : new Error('Payment verification failed. Contact support if charged.')
            );
          }
        })();
      },
      modal: {
        ondismiss: () => {
          if (!settled) {
            settled = true;
            reject(new Error('Payment checkout was cancelled before completion.'));
          }
        },
      },
    });

    rzp.on('payment.failed', (failure) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(
            failure.error?.description || 'Payment failed in Razorpay Checkout. Please try another method.'
          )
        );
      }
    });

    rzp.open();
  });
}
