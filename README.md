# Versprochen & Beschlossen

What the Bundestag decides, and what the parties promised beforehand.

After every sitting day of the German Bundestag, this site publishes an article that goes through the day's decisions and compares each one with the parties' election programmes (and the coalition agreement). The comparison covers how each parliamentary group voted and whether the decision matches, partly matches or contradicts its programme. Every verdict links to the page in the programme PDF where the promise is written. Readers can register, comment on the articles, and get each article by email.

The site itself is in German. Code and docs are in English.

## How an article is made

```
DIP API ──► decisions (grouped per Vorgang and day) ──► details: abstract, Drucksache, vote formula from the plenary protocol
                                                                        │
Programme PDFs ──► page-exact passages ──► German full-text index (+ optional embeddings)
                                                                        │
         Claude writes search queries ──► best passages per decision and per programme
                                                                        │
         Claude analyses each decision against each programme (structured JSON, cites passage ids, quotes verbatim)
                                                                        │
         checks: citations must point at passages Claude was shown; quotes must be in the passage;
                 a verdict without a verifiable citation is withdrawn
                                                                        │
         article stored as JSON ──► rendered page, RSS, newsletter
```

- **Decisions** come from the Bundestag's documentation system [DIP](https://dip.bundestag.de) (`/vorgangsposition`). A decision is a plenary position with a *Beschlussfassung*. Referrals to committee don't count, and the 2nd and 3rd reading of the same bill on the same day are merged into one. Bills and roll-call votes are ranked first. Petitions and elections go to a short list at the end.
- **How the groups voted** isn't in DIP's structured data. It is in the plenary protocol, in the President's vote formula ("mit den Stimmen der … gegen die Stimmen der …"). `src/protocol.js` finds these sentences next to the decision's Drucksache numbers and passes them to Claude.
- **The library** splits each PDF into passages of about 900 characters. A passage never crosses a page, so every citation has an exact page number and a link `…pdf#page=N`. Search uses Postgres full-text search with the German stemmer. With `VOYAGE_API_KEY` set, it also uses vector similarity, fused with reciprocal rank fusion.
- **Claude** (`claude-opus-5`, adaptive thinking, structured outputs) is called roughly `2 + number of decisions` times per article. Requests opt into server-side refusal fallbacks (`fallbacks: "default"`), because parliamentary topics such as defence and extremism can trip a safety classifier.
- **Timing:** a built-in clock ticks every 15 minutes. It fetches DIP hourly, never writes about the current day, and writes an article only once a sitting day's DIP data has stopped changing for 12 hours. It stays quiet before 06:00 Berlin time and gives up on a date after 3 failures in 24 hours. Emails go out between 06:00 and 21:00.

## Deploy on Railway

1. **New project → Deploy from GitHub repo →** `kupma/bundestag`. Railway picks up `railway.json` (Nixpacks, `npm start`, health check `/healthz`).
2. **Add a database:** *New → Database → PostgreSQL*. In the web service's variables, set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`. Tables are created on boot.
3. **Set variables** on the web service (see `.env.example` for all of them):
   | Variable | What for |
   |---|---|
   | `ANTHROPIC_API_KEY` | writing articles |
   | `DIP_API_KEY` | fetching decisions. The public key is at <https://dip.bundestag.de/über-dip/hilfe/api> (rotated yearly), or request a personal one there |
   | `ADMIN_EMAILS` | your email address(es); these accounts can open `/admin` |
   | `MAIL_API_KEY`, `MAIL_FROM` | [Resend](https://resend.com) for address confirmation, password reset and the newsletter. Verify your sending domain in Resend first |
   | `IMPRINT_NAME`, `IMPRINT_ADDRESS`, `IMPRINT_EMAIL` | the legally required *Impressum* |
   | `VOYAGE_API_KEY` | optional, adds semantic search |
4. **Networking → Generate Domain.** `BASE_URL` defaults to that domain; set it explicitly if you use a custom domain.
5. Open the site, **register with an address from `ADMIN_EMAILS`**, and go to **/admin**.
6. **Fill the library** (in *Bibliothek*): add each programme with its PDF address, or upload the PDF and give the address for the links. For the 21st Bundestag (election of 23 February 2025) that means:
   - CDU/CSU: *Politikwechsel für Deutschland*
   - AfD: *Zeit für Deutschland*
   - SPD: *Mehr für Dich. Besser für Deutschland.*
   - Bündnis 90/Die Grünen: *Zusammen wachsen*
   - Die Linke: *Alle wollen regieren. Wir wollen verändern.*
   - CDU, CSU and SPD: coalition agreement *Verantwortung für Deutschland*, with kind *Koalitionsvertrag*

   Download them from the parties' own websites. A scanned PDF without a text layer needs OCR first; the import says so if that's the case.
7. **Check DIP:** in the Railway shell (or locally with the key), run `npm run dip:probe -- 2026-09-24 --raw` for a recent sitting day. Then press *Jetzt aktualisieren* in the admin area. To write an article right away, use *Artikel für Sitzungstag erzeugen*.
8. **Review `/datenschutz`** (a template) before going public.

## Local development

```bash
npm install
cp .env.example .env      # fill in what you have; DATABASE_URL can stay empty
npm run dev               # http://localhost:3000, data in .data/pglite
npm test
```

Without `DATABASE_URL`, the app uses [PGlite](https://pglite.dev), which is real Postgres compiled to WebAssembly. That makes local development and the tests work without installing Postgres. It is a dev dependency only; production uses `pg` against Railway's Postgres.

Scripts (all read the same environment variables, so they also work with `railway run`):

| Command | |
|---|---|
| `npm run dip:probe -- 2026-09-24 [2026-09-26] [--raw]` | what DIP returns and which decisions the app extracts. Read-only |
| `npm run ingest -- --party SPD --title "…" --election "Bundestagswahl 2025" --url https://…pdf [--file local.pdf] [--kind koalitionsvertrag]` | import a programme |
| `npm run generate -- 2026-09-24 [--force] [--mail]` | (re)write one day's article |

## Layout

```
server.js            HTTP server + clock
src/app.js           routes, forms, sessions, CSRF (Origin check), admin actions
src/articles.js      the article pipeline and its checks
src/dip.js           DIP client, decision extraction, sync
src/protocol.js      vote formulas from the plenary protocol
src/programs.js      PDF import, passages
src/retrieval.js     full-text + vector retrieval, library search
src/claude.js        Claude calls (structured output, fallbacks)
src/newsletter.js    daily email, sent at most once per person
src/scheduler.js     the 15-minute tick
src/views/           server-rendered pages (everything escaped by default)
test/                node:test suites with PGlite and fake Claude/DIP/mail
```

## Good to know

- **Cost:** about 2 + N Claude calls per sitting day, where N is at most 8 decisions. Expect somewhere around one to two dollars per article with `claude-opus-5`. The admin table shows the tokens each article actually used. The Bundestag sits on roughly 60–70 days a year.
- **DIP's response format** is implemented from its documentation and hasn't yet been exercised against the live API from this codebase. `npm run dip:probe` is the quickest way to confirm, and `src/dip.js` is the only place to adjust if a field is named differently.
- **Page numbers** are PDF page numbers, not printed page numbers. The site says "PDF-S." everywhere.
- **Programme text** is shown as the cited passage with a link to the party's original, not as a full re-publication.
- **Comments** need a confirmed email address when mail is configured. Admins can delete any comment, users their own. Account deletion removes the user's comments.
