import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PayeeView } from "@/components/trust/payee-view";
import { getContract } from "@/lib/store";

export const instant = false;

/**
 * The payee's side of a contract.
 *
 * Deliberately a separate, link-shareable page with no buyer controls: the
 * freelancer delivers the work and sees the terms they are being held to, but
 * cannot approve, capture or void anything.
 */
export default async function PayeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const record = getContract(id);
  if (!record) notFound();
  return <PayeeView initial={record} />;
}
