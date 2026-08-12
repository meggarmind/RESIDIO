import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!
);

const assignmentId = "04c592d2-d501-5cbb-9af7-6ef5b95f92f8";
const residentId = "9a886541-e783-55c2-b93d-06f0855c90bd";
const note =
  "Legacy import 2026-08-12: active IBB-3AF-2 assignment deactivated after alias audit. OYEDARE GBENGA DAVID is a payment-only alias for CHIBUEZE NICHOLAS JAMES, not a resident. Preserve this resident record for legacy matching; use resident_payment_aliases for payment matching.";

async function main() {
  const { data: resident, error: residentError } = await supabase
    .from("residents")
    .select("id, notes")
    .eq("id", residentId)
    .single();
  if (residentError) throw residentError;

  const existingNotes = resident.notes ?? "";
  const notes = existingNotes.includes(note) ? existingNotes : `${existingNotes}\n\n${note}`.trim();

  const { error: assignmentError } = await supabase
    .from("resident_houses")
    .update({ is_active: false, move_out_date: "2026-08-12" })
    .eq("id", assignmentId);
  if (assignmentError) throw assignmentError;

  const { error: residentUpdateError } = await supabase
    .from("residents")
    .update({ account_status: "inactive", notes })
    .eq("id", residentId);
  if (residentUpdateError) throw residentUpdateError;

  const { data: verify, error: verifyError } = await supabase
    .from("resident_houses")
    .select("id, is_active, move_out_date")
    .eq("id", assignmentId)
    .single();
  if (verifyError) throw verifyError;
  console.log(JSON.stringify(verify, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
