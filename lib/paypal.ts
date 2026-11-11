/**
 * PayPal REST client — server-side ONLY.
 *
 * Never import this from a Client Component: it reads the client secret.
 *
 * Flow used by TrustPay (all real, all sandbox):
 *   create order (intent=AUTHORIZE) -> buyer approves -> authorize -> capture | void
 *
 * Capability boundary: a PayPal authorization is a temporary hold, NOT escrow.
 * Captures are most likely to succeed inside the 3-day honor period; the
 * authorization itself remains valid for up to 29 days.
 * https://developer.paypal.com/checkout/delay-capture
 */

const PAYPAL_API =
  process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new PayPalError(
      "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set. Copy .env.example to .env.local and fill in your sandbox app credentials.",
      500,
      null,
    );
  }
  return { clientId, secret };
}

/** Module-level token cache. PayPal access tokens last ~9h; we refresh early. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const { clientId, secret } = credentials();
  const basic = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PayPalError("PayPal OAuth token request failed", res.status, body);
  }

  const { access_token, expires_in } = body as {
    access_token: string;
    expires_in: number;
  };
  // Refresh 60s before actual expiry.
  cachedToken = {
    value: access_token,
    expiresAt: Date.now() + (expires_in - 60) * 1000,
  };
  return access_token;
}

/** Thin authenticated POST helper. Returns the parsed body and raw text for audit. */
async function paypalPost<T>(
  path: string,
  opts: { body?: unknown; requestId?: string } = {},
): Promise<{ data: T; raw: string }> {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // Ask PayPal for the full resource rather than a minimal response, so the
    // audit log and the UI can show real fields.
    Prefer: "return=representation",
  };
  // Idempotency: protects against double-capture on a retry or double-click.
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;

  const res = await fetch(`${PAYPAL_API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
    cache: "no-store",
  });

  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : {};

  if (!res.ok) {
    throw new PayPalError(
      `PayPal POST ${path} failed (${res.status})`,
      res.status,
      data,
    );
  }
  return { data: data as T, raw };
}

async function paypalGet<T>(path: string): Promise<{ data: T; raw: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!res.ok) {
    throw new PayPalError(
      `PayPal GET ${path} failed (${res.status})`,
      res.status,
      data,
    );
  }
  return { data: data as T, raw };
}

export type PayPalOrder = {
  id: string;
  status: string;
  links?: { href: string; rel: string; method: string }[];
  purchase_units?: {
    payments?: {
      authorizations?: { id: string; status: string; expiration_time?: string }[];
      captures?: { id: string; status: string }[];
    };
  }[];
};

export type PayPalCapture = {
  id: string;
  status: string;
  amount?: { currency_code: string; value: string };
};

export type PayPalAuthorization = {
  id: string;
  status: string;
  expiration_time?: string;
  amount?: { currency_code: string; value: string };
};

/**
 * Create an order with intent=AUTHORIZE. This does NOT move money — it creates
 * the order the buyer then approves.
 */
export async function createAuthorizeOrder(args: {
  amount: string;
  currency: string;
  description: string;
  referenceId: string;
}) {
  return paypalPost<PayPalOrder>("/v2/checkout/orders", {
    requestId: `order-${args.referenceId}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: args.referenceId,
          description: args.description.slice(0, 127),
          amount: {
            currency_code: args.currency,
            value: args.amount,
          },
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "CONTINUE",
      },
    },
  });
}

/** Place the hold. Call only after the buyer has approved the order. */
export async function authorizeOrder(orderId: string) {
  return paypalPost<PayPalOrder>(`/v2/checkout/orders/${orderId}/authorize`, {
    requestId: `auth-${orderId}`,
  });
}

/**
 * Release funds. In TrustPay this is called ONLY after the deterministic
 * policy engine returns allowed:true — never directly from model output.
 */
export async function captureAuthorization(
  authorizationId: string,
  args?: { amount?: string; currency?: string; final?: boolean },
) {
  const body: Record<string, unknown> = {
    final_capture: args?.final ?? true,
  };
  if (args?.amount && args?.currency) {
    body.amount = { currency_code: args.currency, value: args.amount };
  }
  return paypalPost<PayPalCapture>(
    `/v2/payments/authorizations/${authorizationId}/capture`,
    { requestId: `capture-${authorizationId}`, body },
  );
}

/** Cancel the hold and return the funds — the "refuse" path. */
export async function voidAuthorization(authorizationId: string) {
  return paypalPost<Record<string, unknown>>(
    `/v2/payments/authorizations/${authorizationId}/void`,
    { requestId: `void-${authorizationId}` },
  );
}

export async function getOrder(orderId: string) {
  return paypalGet<PayPalOrder>(`/v2/checkout/orders/${orderId}`);
}

export async function getAuthorization(authorizationId: string) {
  return paypalGet<PayPalAuthorization>(
    `/v2/payments/authorizations/${authorizationId}`,
  );
}

/** Pull the authorization id out of an authorize-order response. */
export function extractAuthorizationId(order: PayPalOrder): string | null {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0]?.id ?? null;
}
