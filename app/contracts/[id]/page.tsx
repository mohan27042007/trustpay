import { notFound } from "next/navigation";
import { Shell } from "@/components/trust/shell";
import { ContractView } from "@/components/trust/contract-view";
import { getContract } from "@/lib/store";
import { connection } from "next/server";

// Reads mutable server state on every request, so this route blocks
// rather than prerendering. (Next 16 Cache Components.)
export const instant = false;

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const record = getContract(id);
  if (!record) notFound();

  return (
    <Shell>
      <ContractView
        initial={record}
        paypalClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""}
      />
    </Shell>
  );
}
