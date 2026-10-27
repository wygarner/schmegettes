-- Local development only (`supabase db reset`). Never run against staging or production.

-- Services connect as app_service. Locally it gets a fixed password; real environments set
-- their own (docs/system-docs/operations/deployment.md, "Database roles").
alter role app_service with login password 'app-service-local-only';

-- A few catalog clues so a board can be built before the first real import.
insert into public.clues (season, round, category, value, clue_text, correct_response, source_key) values
  (1, 'single', 'WORLD CAPITALS', 200, 'This city on the Seine is the capital of France', 'Paris', 'seed-1'),
  (1, 'single', 'WORLD CAPITALS', 400, 'Canberra is the capital of this country', 'Australia', 'seed-2'),
  (1, 'single', 'SCIENCE', 200, 'H2O is the chemical formula for this', 'Water', 'seed-3'),
  (1, 'final', 'AMERICAN HISTORY', null, 'This document was signed in 1776', 'The Declaration of Independence', 'seed-4')
on conflict (source_key) do nothing;

-- Synthetic catalog so `start_game()` can build several fresh boards locally: 20 single and 20
-- double categories of 5 clues each, and 4 Final categories.
insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 1, date '2000-01-03', r.round, 'SAMPLE ' || upper(r.round::text) || ' ' || cat, r.step * n,
       'Sample ' || r.round::text || ' clue ' || cat || '.' || n, 'Sample response ' || cat || '.' || n,
       'seed-gen-' || r.round::text || '-' || cat || '-' || n
from (values ('single'::public.round, 200), ('double'::public.round, 400)) as r (round, step)
cross join generate_series(1, 20) as cat
cross join generate_series(1, 5) as n
on conflict (source_key) do nothing;

insert into public.clues (season, air_date, round, category, value, clue_text, correct_response, source_key)
select 1, date '2000-01-03', 'final', 'SAMPLE FINAL ' || cat, null,
       'Sample final clue ' || cat, 'Sample final response ' || cat, 'seed-gen-final-' || cat
from generate_series(1, 4) as cat
on conflict (source_key) do nothing;
