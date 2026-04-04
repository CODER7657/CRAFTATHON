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

create index if not exists idx_reports_jurisdiction_code on public.reports(jurisdiction_code);
create index if not exists idx_reports_status on public.reports(status);
create index if not exists idx_reports_created_at on public.reports(created_at desc);
create index if not exists idx_reports_tracking_id on public.reports(tracking_id);
create index if not exists idx_audit_logs_tracking_id on public.audit_logs(tracking_id);
create index if not exists idx_flagged_domains_domain on public.flagged_domains(domain);
