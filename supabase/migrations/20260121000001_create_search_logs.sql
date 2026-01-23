-- Create search_logs table for tracking global search usage
create table if not exists search_logs (
  id uuid default gen_random_uuid() primary key,
  query_text text not null,
  user_id uuid references auth.users(id),
  results_count integer default 0,
  created_at timestamptz default now()
);

-- Add index for analytics queries
create index if not exists idx_search_logs_created_at on search_logs(created_at);
create index if not exists idx_search_logs_query_text on search_logs(query_text);

-- Enable RLS
alter table search_logs enable row level security;

-- Policies
-- Admins can view logs
create policy "Admins can view search logs"
  on search_logs for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'chairman', 'financial_secretary')
    )
  );

-- Authenticated users can insert logs (via API)
create policy "Users can insert search logs"
  on search_logs for insert
  to authenticated
  with check (auth.uid() = user_id);
