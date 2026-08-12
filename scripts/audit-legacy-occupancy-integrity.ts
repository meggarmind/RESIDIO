import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!
);

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

  const { data: assignments, error: assignmentsError } = await supabase
    .from("resident_houses")
    .select(
      "id, house_id, resident_role, is_primary, is_live_in, resident:residents!resident_houses_resident_id_fkey(first_name, last_name, company_name)"
    )
    .eq("is_active", true)
    .in("house_id", (houses ?? []).map((house) => house.id));
  if (assignmentsError) throw assignmentsError;

  const streetById = new Map((streets ?? []).map((street) => [street.id, street.short_name]));
  const assignmentsByHouse = new Map<string, typeof assignments>();
  for (const assignment of assignments ?? []) {
    const entries = assignmentsByHouse.get(assignment.house_id) ?? [];
    entries.push(assignment);
    assignmentsByHouse.set(assignment.house_id, entries);
  }
  const concise = (house: (typeof houses)[number], entries: NonNullable<typeof assignments>) => ({
    street: streetById.get(house.street_id),
    house: house.short_name,
    entries: entries.map((entry) => {
      const resident = entry.resident as unknown as { first_name: string | null; last_name: string | null; company_name: string | null } | null;
      return {
        name: resident?.company_name || [resident?.first_name, resident?.last_name].filter(Boolean).join(" "),
        role: entry.resident_role,
        primary: entry.is_primary,
        liveIn: entry.is_live_in,
      };
    }),
  });

  const noActive: unknown[] = [];
  const multiplePrimary: unknown[] = [];
  const contradictoryLiveIn: unknown[] = [];
  for (const house of houses ?? []) {
    const entries = assignmentsByHouse.get(house.id) ?? [];
    if (entries.length === 0) {
      noActive.push({ street: streetById.get(house.street_id), house: house.short_name });
      continue;
    }
    if (entries.filter((entry) => entry.is_primary).length > 1) {
      multiplePrimary.push(concise(house, entries));
    }
    const liveInRoles = new Set(entries.filter((entry) => entry.is_live_in).map((entry) => entry.resident_role));
    if (liveInRoles.has("tenant") && liveInRoles.has("resident_landlord")) {
      contradictoryLiveIn.push(concise(house, entries));
    }
  }

  console.log(JSON.stringify({
    scopedHouses: houses?.length ?? 0,
    activeAssignments: assignments?.length ?? 0,
    noActiveCount: noActive.length,
    noActive: noActive.slice(0, 30),
    multiplePrimaryCount: multiplePrimary.length,
    multiplePrimary,
    contradictoryLiveInCount: contradictoryLiveIn.length,
    contradictoryLiveIn,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
