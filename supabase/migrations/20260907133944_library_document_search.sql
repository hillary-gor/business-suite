-- ===========================================================================
-- Ranked catalogue search for Skyjet Library.
--
-- ILIKE on title is not search. A generated tsvector plus a GIN index lets
-- the catalogue rank by relevance while RLS still hides uncleared rows.
-- File bytes are not indexed here; that needs text extracted at upload.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

alter table library.documents
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(part_number, '')), 'A')
    || setweight(to_tsvector('simple', coalesce(file_name, '')), 'B')
    || setweight(to_tsvector('simple', coalesce(manufacturer, '')), 'B')
    || setweight(
         to_tsvector(
           'simple',
           coalesce(aircraft_type, '') || ' ' || coalesce(aircraft_model, '')
         ),
         'B'
       )
    || setweight(
         to_tsvector(
           'simple',
           coalesce(revision, '') || ' ' || coalesce(version, '')
         ),
         'C'
       )
    || setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) stored;

comment on column library.documents.search_vector is
  'Catalogue search document. Title and part number outrank description. Not file contents.';

create index if not exists library_documents_search_idx
  on library.documents using gin (search_vector);
