import { NextResponse } from 'next/server';
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { extractRole, isAdminRole } from '@/lib/auth/action-roles';
import { rateLimited } from '@/lib/performance/rate-limit';
import { sanitizeEvent } from '@/lib/performance/telemetry';
import type { PerformanceEvent, PerformanceEventInput } from '@/lib/performance/types';

export const runtime = 'nodejs';

/*
 * Recorded exception to the per-write authorizePermission()/logAudit() rule (#957, owner decision
 * 2026-10-22). Reason: the events are machine-generated load-time measurements with no user data
 * (the sanitiser allow-lists every label and the table has no user id), they arrive in volume, and
 * writing one audit entry per event would swamp audit_logs. The gate is instead: a signed-in user
 * with an admin-side role, a body cap, an event cap and a per-user rate limit.
 */

const MAX_BODY_BYTES = 8 * 1024;
const MAX_EVENTS = 50;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

function toRow(event: PerformanceEvent) {
  const e = event as Record<string, unknown>;
  const num = (key: string) => (typeof e[key] === 'number' ? (e[key] as number) : null);
  const bool = (key: string) => (typeof e[key] === 'boolean' ? (e[key] as boolean) : null);
  return {
    occurred_at: new Date(event.occurredAt).toISOString(),
    event_type: event.type,
    label: (e.operation ?? e.cache ?? e.snapshot ?? e.action) as string,
    duration_ms: num('durationMs'),
    result_count: num('resultCount'),
    item_count: num('itemCount'),
    byte_size: num('byteSize'),
    age_ms: num('ageMs'),
    max_stale_ms: num('maxStaleMs'),
    success: bool('success'),
    blocked: bool('blocked'),
  };
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('app_roles!profiles_role_id_fkey (name, category)')
    .eq('id', user.id)
    .maybeSingle();
  if (!isAdminRole(extractRole(profile?.app_roles))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = Date.now();
  if (rateLimited(user.id, now)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const declared = Number(request.headers.get('content-length'));
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const raw = (body as { events?: unknown } | null)?.events;
  if (!Array.isArray(raw) || raw.length > MAX_EVENTS) {
    return NextResponse.json({ error: 'Invalid events' }, { status: 400 });
  }

  const rows = [];
  for (const item of raw) {
    const claimed = (item as { occurredAt?: unknown } | null)?.occurredAt;
    const occurredAt =
      typeof claimed === 'number' && Number.isFinite(claimed) && Math.abs(now - claimed) <= MAX_CLOCK_SKEW_MS
        ? Math.floor(claimed)
        : now;
    const event = sanitizeEvent(item as PerformanceEventInput, occurredAt);
    // mutation_failure is out of this slice (#957).
    if (event && event.type !== 'mutation_failure') rows.push(toRow(event));
  }
  if (rows.length === 0) return NextResponse.json({ accepted: 0 });

  // The generated types do not know this table yet; same cast as the system-log recorder.
  const client = createAdminClient() as unknown as {
    from(table: string): { insert(rows: unknown[]): PromiseLike<{ error: { message: string } | null }> };
  };
  const { error } = await client.from('performance_events').insert(rows);
  if (error) {
    console.error('[Telemetry] performance_events insert failed', { error: error.message });
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 });
  }
  return NextResponse.json({ accepted: rows.length });
}
