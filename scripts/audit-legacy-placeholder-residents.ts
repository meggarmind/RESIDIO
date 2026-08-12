import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!
);

async function main() {
  const { data: residents, error: residentsError } = await supabase
    .from("residents")
    .select("id, first_name, last_name, company_name, phone_primary, account_status, notes")
    .ilike("phone_primary", "LEGACY-NO-PHONE-%")
    .order("last_name")
    .order("first_name");
  if (residentsError) throw residentsError;

  const { data: assignments, error: assignmentsError } = await supabase
    .from("resident_houses")
    .select("resident_id, is_active, resident_role, is_live_in, house:houses!resident_houses_house_id_fkey(short_name)")
    .in("resident_id", (residents ?? []).map((resident) => resident.id));
  if (assignmentsError) throw assignmentsError;

  const assignmentByResident = new Map<string, typeof assignments>();
  for (const assignment of assignments ?? []) {
    const entries = assignmentByResident.get(assignment.resident_id) ?? [];
    entries.push(assignment);
    assignmentByResident.set(assignment.resident_id, entries);
  }

  const results = (residents ?? []).map((resident) => ({
    name: resident.company_name || [resident.first_name, resident.last_name].filter(Boolean).join(" "),
    phone: resident.phone_primary,
    status: resident.account_status,
    documented: /LEGACY|placeholder/i.test(resident.notes ?? ""),
    expectedInactiveDuplicate:
      resident.account_status === "inactive" && /duplicate/i.test(resident.notes ?? ""),
    assignments: (assignmentByResident.get(resident.id) ?? []).map((assignment) => ({
      house: (assignment.house as unknown as { short_name: string } | null)?.short_name,
      active: assignment.is_active,
      role: assignment.resident_role,
      liveIn: assignment.is_live_in,
    })),
  }));
  const issues = results.filter(
    (result) => !result.documented || (result.assignments.length === 0 && !result.expectedInactiveDuplicate)
  );
  console.log(JSON.stringify({ placeholders: results, issueCount: issues.length, issues }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
