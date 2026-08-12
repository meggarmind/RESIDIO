import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL_CLOUD!,
  process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD!
);

const targets = [
  { street: "GLB", shortName: "GLB-14 F1" },
  { street: "GLB", shortName: "GLB-14 F2" },
  { street: "GLB", shortName: "GLB-14 F4" },
  { street: "GLB", shortName: "GLB-14F-3" },
  { street: "OJO.K", shortName: "OJO.K-9B" },
];

async function main() {
  const { data: streets, error: streetsError } = await supabase
    .from("streets")
    .select("id, short_name")
    .in("short_name", [...new Set(targets.map((target) => target.street))]);
  if (streetsError) throw streetsError;
  const streetIdByName = new Map((streets ?? []).map((street) => [street.short_name, street.id]));

  const targetHouseIds: string[] = [];
  for (const target of targets) {
    const { data: house, error: houseError } = await supabase
      .from("houses")
      .select("id")
      .eq("street_id", streetIdByName.get(target.street)!)
      .eq("short_name", target.shortName)
      .single();
    if (houseError) throw houseError;
    targetHouseIds.push(house.id);
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("resident_houses")
    .select("id, house_id, resident_role, is_primary")
    .in("house_id", targetHouseIds)
    .eq("is_active", true)
    .eq("resident_role", "non_resident_landlord")
    .eq("is_primary", true);
  if (assignmentsError) throw assignmentsError;

  const ids = (assignments ?? []).map((assignment) => assignment.id);
  if (ids.length !== 5) throw new Error(`Expected 5 non-resident landlord primary assignments; found ${ids.length}.`);

  const { error: updateError } = await supabase
    .from("resident_houses")
    .update({ is_primary: false })
    .in("id", ids);
  if (updateError) throw updateError;

  const { data: verify, error: verifyError } = await supabase
    .from("resident_houses")
    .select("id, house_id, resident_role, is_primary")
    .in("id", ids)
    .order("id");
  if (verifyError) throw verifyError;
  if ((verify ?? []).some((assignment) => assignment.is_primary)) {
    throw new Error("Verification failed: a non-resident landlord is still primary.");
  }
  console.log(JSON.stringify({ normalizedAssignmentIds: ids, verify }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
