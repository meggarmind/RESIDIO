import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!
);

const normalize = (value: string | null | undefined) =>
  (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function main() {
  const legacyStreetCodes = ["OJO.K", "IBB", "GLB", "KOA"];
  const { data: streets, error: streetsError } = await supabase
    .from("streets")
    .select("id, short_name")
    .in("short_name", legacyStreetCodes);
  if (streetsError) throw streetsError;

  const { data: houses, error: housesError } = await supabase
    .from("houses")
    .select("id, short_name, street_id")
    .in("street_id", (streets ?? []).map((street) => street.id));
  if (housesError) throw housesError;

  const { data: aliases, error: aliasesError } = await supabase
    .from("resident_payment_aliases")
    .select("alias_name, resident_id");
  if (aliasesError) throw aliasesError;

  const aliasOwners = new Map<string, Set<string>>();
  for (const alias of aliases ?? []) {
    const key = normalize(alias.alias_name);
    if (!key) continue;
    const owners = aliasOwners.get(key) ?? new Set<string>();
    owners.add(alias.resident_id);
    aliasOwners.set(key, owners);
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("resident_houses")
    .select(
      "id, house_id, resident_id, resident_role, is_primary, resident:residents!resident_houses_resident_id_fkey(first_name, last_name, company_name)"
    )
    .eq("is_active", true)
    .in("house_id", (houses ?? []).map((house) => house.id));
  if (assignmentsError) throw assignmentsError;

  const streetById = new Map((streets ?? []).map((street) => [street.id, street.short_name]));
  const houseById = new Map((houses ?? []).map((house) => [house.id, house]));
  const candidates = (assignments ?? [])
    .map((assignment) => {
      const resident = assignment.resident as unknown as {
        first_name: string | null;
        last_name: string | null;
        company_name: string | null;
      } | null;
      const name = resident?.company_name || [resident?.first_name, resident?.last_name].filter(Boolean).join(" ");
      const ownerIds = aliasOwners.get(normalize(name));
      if (!ownerIds || ownerIds.size === 0 || ownerIds.has(assignment.resident_id)) return null;
      const house = houseById.get(assignment.house_id)!;
      return {
        street: streetById.get(house.street_id),
        house: house.short_name,
        activeAssignmentId: assignment.id,
        activeResidentName: name,
        activeResidentId: assignment.resident_id,
        role: assignment.resident_role,
        isPrimary: assignment.is_primary,
        aliasOwnerIds: [...ownerIds],
      };
    })
    .filter(Boolean);

  console.log(JSON.stringify({ activeAssignments: assignments?.length ?? 0, candidates }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
