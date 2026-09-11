-- Public company identity for the sign-in screen.
--
-- The login page has no session, so it cannot use the entity-scoped SELECT
-- policies. These SECURITY DEFINER functions return only the display name and
-- uploaded mark of the single active entity — nothing else from app.entities.

set search_path = pg_catalog, public, extensions;

create or replace function app.public_company_brand()
returns table (
  display_name text,
  has_logo     boolean,
  cache_key    text
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select nullif(btrim(coalesce(e.trading_name, e.legal_name)), '') as display_name,
         (e.logo_bytes is not null and e.logo_mime is not null) as has_logo,
         e.updated_at::text as cache_key
    from app.entities e
   where e.is_active
   order by e.created_at
   limit 1;
$$;

comment on function app.public_company_brand() is
  'Trading or legal name and whether a custom logo is stored. Used on the unauthenticated sign-in page; returns no row when no active entity exists.';

create or replace function app.public_company_logo()
returns table (
  mime  text,
  bytes bytea
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select e.logo_mime, e.logo_bytes
    from app.entities e
   where e.is_active
     and e.logo_bytes is not null
     and e.logo_mime is not null
   order by e.created_at
   limit 1;
$$;

comment on function app.public_company_logo() is
  'Uploaded company mark for the sign-in page. Empty when none has been stored.';

revoke all on function app.public_company_brand() from public, anon, authenticated;
revoke all on function app.public_company_logo() from public, anon, authenticated;
grant execute on function app.public_company_brand() to skyjet_app;
grant execute on function app.public_company_logo() to skyjet_app;
