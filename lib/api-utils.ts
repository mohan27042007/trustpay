import { NextResponse } from "next/server";
import { PayPalError } from "./paypal";

/** Turn any thrown error into a JSON response without leaking secrets. */
export function errorResponse(err: unknown) {
  if (err instanceof PayPalError) {
    console.error("[paypal]", err.message, JSON.stringify(err.body));
    return NextResponse.json(
      { ok: false, error: err.message, paypal: err.body },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
    );
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[api]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
