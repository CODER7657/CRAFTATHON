create extension if not exists pgcrypto;

create table if not exists public.authorities (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    jurisdiction_code text not null unique,
    api_key_hash text not null,
    wallet_address text,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),
    tracking_id uuid not null unique,
    report_hash text not null unique,
    jurisdiction_code text not null,
    status text not null default 'submitted',
    incident_text text not null,
    source_url text,
    image_cid text,
    ipfs_cid text,
    zk_proof_hash text not null,
    risk_score integer not null default 0 check (risk_score >= 0 and risk_score <= 100),
    ai_label text not null default 'review',
    image_label text,
    combined_label text not null default 'review',
    authority_action text,
    ai_explanation jsonb,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    tracking_id uuid not null references public.reports(tracking_id) on delete cascade,
    actor_type text not null,
    actor_id text,
    action text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.flagged_domains (
    id uuid primary key default gen_random_uuid(),
    domain text not null unique,
    severity text not null,
    reason text not null,
    report_tracking_id uuid references public.reports(tracking_id) on delete set null,
    created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row
execute function public.set_updated_at();

alter table public.authorities enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.flagged_domains enable row level security;

create or replace function public.current_authority_jurisdiction()
returns text
language sql
stable
as $$
    select jurisdiction_code
    from public.authorities
    where id::text = auth.jwt() ->> 'sub'
    limit 1
$$;

drop policy if exists authorities_self_read on public.authorities;
create policy authorities_self_read
on public.authorities
for select
to authenticated
using (id::text = auth.jwt() ->> 'sub');

drop policy if exists reports_select_by_jurisdiction on public.reports;
create policy reports_select_by_jurisdiction
on public.reports
for select
to authenticated
using (jurisdiction_code = public.current_authority_jurisdiction());

drop policy if exists reports_update_by_jurisdiction on public.reports;
create policy reports_update_by_jurisdiction
on public.reports
for update
to authenticated
using (jurisdiction_code = public.current_authority_jurisdiction())
with check (jurisdiction_code = public.current_authority_jurisdiction());

drop policy if exists audit_logs_select_by_report_jurisdiction on public.audit_logs;
create policy audit_logs_select_by_report_jurisdiction
on public.audit_logs
for select
to authenticated
using (
    exists (
        select 1
        from public.reports
        where reports.tracking_id = audit_logs.tracking_id
          and reports.jurisdiction_code = public.current_authority_jurisdiction()
    )
);

drop policy if exists flagged_domains_select_for_authorities on public.flagged_domains;
create policy flagged_domains_select_for_authorities
on public.flagged_domains
for select
to authenticated
using (true);

drop policy if exists service_role_full_access_authorities on public.authorities;
create policy service_role_full_access_authorities
on public.authorities
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_full_access_reports on public.reports;
create policy service_role_full_access_reports
on public.reports
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_full_access_audit_logs on public.audit_logs;
create policy service_role_full_access_audit_logs
on public.audit_logs
for all
to service_role
using (true)
with check (true);

drop policy if exists service_role_full_access_flagged_domains on public.flagged_domains;
create policy service_role_full_access_flagged_domains
on public.flagged_domains
for all
to service_role
using (true)
with check (true);

-- ---------------------------------------------------------------------------
-- Performance indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_reports_jurisdiction_code on public.reports(jurisdiction_code);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_created_at on public.reports(created_at desc);
create index if not exists idx_reports_tracking_id on public.reports(tracking_id);
create index if not exists idx_audit_logs_tracking_id on public.audit_logs(tracking_id);
create index if not exists idx_flagged_domains_domain on public.flagged_domains(domain);
