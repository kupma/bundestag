// Append-only. A migration that has shipped is never edited; a change to the
// schema is a new entry at the end.

export const MIGRATIONS = [
  {
    id: 1,
    sql: `
create table users (
  id serial primary key,
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  is_admin boolean not null default false,
  email_verified_at timestamptz,
  newsletter boolean not null default false,
  unsubscribe_token text not null unique,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

create table user_tokens (
  token_hash text primary key,
  user_id int not null references users(id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index user_tokens_user_idx on user_tokens(user_id);

-- The library: one row per election programme (or coalition agreement), cut
-- into passages that never cross a page, so every citation has a page number.
create table programs (
  id serial primary key,
  slug text not null unique,
  party text not null,
  title text not null,
  kind text not null default 'wahlprogramm' check (kind in ('wahlprogramm', 'koalitionsvertrag', 'sonstiges')),
  election text not null default '',
  source_url text not null default '',
  page_count int not null default 0,
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  error text,
  embedding_model text,
  created_at timestamptz not null default now()
);

create table program_chunks (
  id serial primary key,
  program_id int not null references programs(id) on delete cascade,
  page int not null,
  ord int not null,
  text text not null,
  tsv tsvector generated always as (to_tsvector('german', text)) stored,
  embedding real[]
);
create index program_chunks_program_idx on program_chunks(program_id, page, ord);
create index program_chunks_tsv_idx on program_chunks using gin(tsv);

-- One row per Vorgang and sitting day: the 2nd and 3rd reading of a bill on
-- the same day are one decision, not two.
create table decisions (
  id serial primary key,
  dip_key text not null unique,
  vorgang_id text not null,
  sitting_date text not null,
  title text not null,
  vorgangstyp text not null default '',
  outcome text not null default '',
  importance int not null default 0,
  data jsonb not null,
  -- fetched when an article is written: abstract, Drucksache excerpts, votes
  details jsonb,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index decisions_date_idx on decisions(sitting_date);

create table articles (
  id serial primary key,
  sitting_date text not null unique,
  slug text not null unique,
  title text not null,
  lede text not null,
  body jsonb not null,
  status text not null default 'published' check (status in ('published', 'hidden')),
  model text not null default '',
  usage jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  mailed_at timestamptz
);

create table article_citations (
  article_id int not null references articles(id) on delete cascade,
  chunk_id int not null references program_chunks(id) on delete cascade,
  primary key (article_id, chunk_id)
);
create index article_citations_chunk_idx on article_citations(chunk_id);

create table comments (
  id serial primary key,
  article_id int not null references articles(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_article_idx on comments(article_id, created_at);

-- At most one letter per person per article, whoever calls the sender and
-- however often: the row is claimed before the letter goes out.
create table email_deliveries (
  article_id int not null references articles(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  status text not null,
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  primary key (article_id, user_id)
);

create table job_runs (
  id serial primary key,
  kind text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary text not null default ''
);
create index job_runs_kind_idx on job_runs(kind, started_at);
`,
  },
  {
    id: 2,
    sql: `
-- Programmes from the built-in standard library carry the key of their entry
-- in src/program-sources.js, so the app knows which ones it already has.
alter table programs add column source_key text;
create unique index programs_source_key_idx on programs(source_key) where source_key is not null;
`,
  },
  {
    id: 3,
    sql: `
-- Visitor statistics without cookies (src/analytics.js): one row per page
-- delivered to a person. "visitor" is a hash with a salt that changes daily.
create table page_views (
  id bigserial primary key,
  day date not null,
  path text not null,
  referrer text not null default '',
  source text not null default '',
  device text not null default '',
  visitor text not null,
  created_at timestamptz not null default now()
);
create index page_views_day_idx on page_views(day);
create index page_views_created_idx on page_views(created_at);

create table analytics_salts (
  day date primary key,
  salt text not null
);
`,
  },
];
