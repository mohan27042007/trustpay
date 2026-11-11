"use client";

import { useState } from "react";
import {
  PayPalScriptProvider,
  PayPalButtons,
} from "@paypal/react-paypal-js";

/**
 * Block A vertical spike — deliberately unstyled.
 *
 * Purpose: prove a REAL PayPal sandbox authorize -> capture round trip before
 * any design work happens. This page is the evidence that the project clears
 * the hackathon's Stage One "working build" gate.
 */
export default function SpikePage() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";
  const [orderId, setOrderId] = useState<string | null>(null);
  const [authorizationId, setAuthorizationId] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const push = (label: string, payload: unknown) =>
    setLog((l) => [
      `${new Date().toISOString().slice(11, 19)}  ${label}\n${JSON.stringify(payload, null, 2)}`,
      ...l,
    ]);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    push(`POST ${path} -> ${res.status}`, json);
    if (!json.ok) throw new Error(json.error ?? "request failed");
    return json;
  }

  if (!clientId) {
    return (
      <main style={{ padding: 32, fontFamily: "monospace", lineHeight: 1.6 }}>
        <h1>TrustPay — PayPal spike</h1>
        <p style={{ color: "#b00" }}>
          <strong>NEXT_PUBLIC_PAYPAL_CLIENT_ID is not set.</strong>
        </p>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your
          sandbox credentials, then restart the dev server.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, fontFamily: "monospace", maxWidth: 820, lineHeight: 1.6 }}>
      <h1>TrustPay — PayPal sandbox spike</h1>
      <p>
        intent=<strong>AUTHORIZE</strong> &rarr; buyer approves &rarr; authorize
        (hold) &rarr; capture or void.
      </p>

      <section style={{ margin: "24px 0", padding: 16, border: "1px solid #ccc" }}>
        <div>order: <strong>{orderId ?? "—"}</strong></div>
        <div>authorization: <strong>{authorizationId ?? "—"}</strong></div>
        <div>capture: <strong>{captureId ?? "—"}</strong></div>
      </section>

      <PayPalScriptProvider
        options={{ clientId, intent: "authorize", currency: "USD" }}
      >
        <PayPalButtons
          style={{ layout: "vertical" }}
          createOrder={async () => {
            const json = await post("/api/paypal/create-order", {
              amount: "150.00",
              currency: "USD",
              description: "Logo design — TrustPay spike",
              referenceId: `spike-${Date.now()}`,
            });
            setOrderId(json.orderId);
            return json.orderId;
          }}
          onApprove={async (data) => {
            const json = await post("/api/paypal/authorize", {
              orderId: data.orderID,
            });
            setAuthorizationId(json.authorizationId);
          }}
          onError={(err) => push("paypal sdk error", String(err))}
        />
      </PayPalScriptProvider>

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          disabled={!authorizationId}
          onClick={async () => {
            const json = await post("/api/paypal/capture", {
              authorizationId,
              amount: "150.00",
              currency: "USD",
            });
            setCaptureId(json.captureId);
          }}
        >
          Capture funds
        </button>
        <button
          disabled={!authorizationId}
          onClick={() => post("/api/paypal/void", { authorizationId })}
        >
          Void (refuse)
        </button>
      </div>

      <h2 style={{ marginTop: 32 }}>Raw PayPal responses</h2>
      <pre
        style={{
          background: "#111",
          color: "#0f0",
          padding: 16,
          fontSize: 12,
          overflowX: "auto",
          maxHeight: 420,
        }}
      >
        {log.join("\n\n") || "(no calls yet)"}
      </pre>
    </main>
  );
}
