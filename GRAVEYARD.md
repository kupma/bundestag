# Graveyard

Features and approaches this site once had and has no more: what each one was, when it came and went, why it went, what took its place, and what is still lying around in the code. **Before planning something new, look here first.** It may have been tried already, and the reason it went is usually the part worth knowing.

When a change removes a feature or replaces an approach, add an entry in the same commit, newest first (template at the end). Dates are those of the commits (UTC); `git show <commit>` brings back the code as it was.

## At a glance

| Buried | What | Lived | Why, in one line |
|---|---|---|---|
| 2026-10-18 | [Landing page: a camera that jumped](#landing-page-a-camera-that-jumped) | 22 days | cards hid seats, and the hall showed no debate |
| 2026-10-17 | [Comparing decisions with the election programmes](#comparing-decisions-with-the-election-programmes) | 22 days | coalitions and compromises make programmes a poor yardstick |
| 2026-10-17 | [The programme library](#the-programme-library) | 22 days | it only served the comparison |
| 2026-10-17 | [Automatic download of the programmes](#automatic-download-of-the-programmes) | 22 days | went with the library |
| 2026-10-17 | [Two circles: verdict mark, logo and tagline](#two-circles-verdict-mark-logo-and-tagline) | 22 days | meant nothing without the comparison |
| 2026-10-15 | [Preview, first version](#preview-first-version) | 17 days | times jumped back and forth; a wall of procedural text |
| 2026-10-13 | [Up to three suggestions, general ones included](#up-to-three-suggestions-general-ones-included) | 18 days | general tips fit under any decision, so they said nothing |
| 2026-09-30 | [Claude Opus 5 for the articles](#claude-opus-5-for-the-articles) | 5 days | Sonnet 5.5 costs less than half |
| 2026-09-30 | [Re-analysing everything on every rewrite](#re-analysing-everything-on-every-rewrite) | 5 days | paid again for unchanged input |
| 2026-09-26 | [The first name of the site](#the-first-name-of-the-site) | 20 hours | no reason recorded |
| 2026-09-26 | [The home page hero](#the-home-page-hero) | 20 hours | replaced by the plenary hall |
| 2026-09-25 | [Waiting for twelve quiet hours](#waiting-for-twelve-quiet-hours) | 1½ hours | a freshly deployed site stayed empty |
| 2026-09-25 | [Traffic-light verdicts and a navy accent](#traffic-light-verdicts-and-a-navy-accent) | 36 minutes | in Germany, every hue belongs to a party |
| 2026-09-25 | [The static prototype](#the-static-prototype) | 3 hours | sample data, and a score that said nothing |

---

### Landing page: a camera that jumped

*2026-09-26 (`d28a6b4`) – 2026-10-18 (`a69b2f8`) · 22 days*

- **What it was.** The first scroll through the plenary hall: the camera jumped from view to view with the scroll, the text cards could cover a group of seats on wide screens, and the hall itself was still.
- **Why it went.** A card hiding a parliamentary group is a problem on a site that shows every group the same way. And a silent hall said nothing about what parliament is.
- **What took its place.** One camera view per card, gliding after the scroll; on wide screens the plan sits right of the text. Lines of debate arc across the aisles and every line is answered; during the vote the hall falls silent. The animation runs only while the hall is on screen (`static/landing.js`).

### Comparing decisions with the election programmes

*2026-09-25 (`e3e829e`) – 2026-10-17 (`b3fa6e0`) · 22 days*

- **What it was.** The original idea of the site. Every decision was measured against the 2025 election programmes of each group and the coalition agreement of CDU, CSU and SPD. Claude wrote search queries, the best passages of each programme were retrieved ([the library](#the-programme-library)), and Claude gave one verdict per programme: *entspricht*, *teilweise*, *widerspricht* or *nicht thematisiert*, next to the group's vote. Each verdict cited passages by id and quoted them word for word; a check withdrew every verdict whose citation or quote could not be found in its passage. Articles had "Was in den Programmen steht" under each decision and an "Auf einen Blick" table (decisions × programmes) at the top.
- **Why it went.** A parliament that only ever did what the programmes say could not form coalitions or find compromises, so measuring decisions against them told readers less than it seemed to, and pushed them towards "they broke their promise" for what is ordinary coalition work. The old *Grenzen* section named more limits: a search can miss the right passage, programmes are vaguer than laws, and *nicht thematisiert* only meant "not in the passages we found", not "the party has no view".
- **What took its place.** Each decision explained in plain words, one vote per group read from the plenary protocol, and the hand-written "Was heißt das?".
- **Left behind.** The tables `programs`, `program_chunks` and `article_citations`, unused. Articles of `ARTICLE_VERSION` 1 are rewritten by the clock; until then `votesOf` in `src/views/public.js` maps their per-programme votes onto the groups. A test makes sure no article page mentions programmes again.
- **Before you try again.** The technical part worked: the citation checks held. What sank it was the idea. Anything that scores groups against what they promised meets the same objection and needs an answer to it first, for instance how to show a compromise as a compromise rather than as a broken promise.

### The programme library

*2026-09-25 (`e3e829e`) – 2026-10-17 (`b3fa6e0`) · 22 days*

- **What it was.** The programme PDFs, imported and cut into passages of about 900 characters that never crossed a page, so every citation had an exact page and a link to `…pdf#page=N`. Search was Postgres full-text search with the German stemmer; with `VOYAGE_API_KEY` set, also vector similarity (Voyage embeddings), fused by reciprocal rank fusion. Public pages: `/programme` (list and search, also announced as a `SearchAction` to search engines), `/programme/:slug` and `/stelle/:id` (one passage). Admins added programmes in a *Bibliothek* section by address or upload; `npm run ingest` did the same from a shell. It needed `unpdf` and `pdf-lib`.
- **Why it went.** It only existed for the comparison.
- **Left behind.** `/programme`, `/programme/:slug` and `/stelle/:id` answer with a permanent redirect home (`src/app.js`). The router's `raw` body option and the `search` rate limit in `src/app.js` have had no user since, and the comment at the top of `src/app.js` still mentions "the admin upload".
- **Before you try again.** If the site ever needs search (over articles, say): Postgres full-text search with the German stemmer did well on its own; the embeddings were an optional extra.

### Automatic download of the programmes

*2026-09-25 (`aa1a27c`) – 2026-10-17 (`b3fa6e0`) · 22 days*

- **What it was.** On the first tick after a deploy, the app downloaded the programmes of every group and the coalition agreement from the parties' own websites (`src/program-sources.js`, with fallback addresses). Every file was checked before import: a real PDF, long enough to be the full version, readable text, its own title inside. Short versions, easy-language editions and drafts were turned away. If no listed address worked, Claude's web search looked for the file, limited to the party's own domains. Three failures a day paused a source; `DEFAULT_LIBRARY=off` switched it off.
- **Why it went.** With the library.
- **Before you try again.** Party websites move their PDFs, and the first hit is often a short version. A fixed list of addresses alone was not enough; the checks were what made it work.

### Two circles: verdict mark, logo and tagline

*2026-09-25 (`a63fe89`) – 2026-10-17 (`b3fa6e0`) · 22 days*

- **What it was.** Two overlapping circles, *versprochen* and *beschlossen*; how far they overlapped showed whether a decision matched, partly matched or contradicted a programme. The same circles were the logo and favicon. The tagline: "Was versprochen war. Was beschlossen wurde."
- **Why it went.** Without the comparison it meant nothing.
- **What took its place.** The logo is the hall's three rows of seats; votes are pills told apart by shape (filled, outlined, dashed, dotted). The tagline is "Was der Bundestag beschließt. Verständlich erklärt."
- **Left behind.** The share image's address carries a content hash since then, so social networks pick up a new image.
- **Worth keeping.** Meaning by shape instead of colour started here and is the site's rule now.

### Preview, first version

*2026-09-28 (`92a7029`) – 2026-10-15 (`19a4337`, `6aeb806`) · 17 days*

- **What it was.** `/vorschau` sorted the items of a day by kind, bills first, then committee reports. Every item showed everything at once: the agenda's procedural wording and (from 2026-10-15, for one hour) all its summaries. A bundle of votes without debate listed a dozen lines of "Beratung der Beschlussempfehlung und des Berichts des Ausschusses für …" with the actual topic cut off; texts shortened with "…" could not be read in full; times read "09:00 Uhr · TOP 8".
- **Why it went.** Sorted by kind, the times jumped back and forth. Shown all at once, the page was a wall of official language, which is the thing the site exists to translate.
- **What took its place.** The agenda's own order, which is the order of the day. Each item folds: closed, one line on what it is about; open, the rest. `gistOf` reads what each part of an item is and who brought it in. "Ganzen Text lesen" for shortened texts; "Geplant um 9:00 Uhr · Tagesordnungspunkt 8".

### Up to three suggestions, general ones included

*2026-09-25 (`a63fe89`) – 2026-10-13 (`a54730b`) · 18 days*

- **What it was.** "Was du tun kannst" under each decision: up to three small steps at three levels, *Für dich*, *Mit anderen* and *In der Politik*, linking to the curated list, which then included general entries (your MPs, petitions, reading up, the Mitmachen pages).
- **Why it went.** "Ask your MP", "sign a petition", "talk to your neighbours" fit under any decision, so they said nothing about this one.
- **What took its place.** At most two steps that would not stand there without the decision; an empty list is often the right answer. The general tips live on `/mitmachen`.
- **Left behind.** `isGeneralAction` and `shownActions` in `src/resources.js` hide such suggestions in older articles, on the page and in the newsletter.

### Claude Opus 5 for the articles

*2026-09-25 (`e3e829e`) – 2026-09-30 (`7169b77`) · 5 days*

- **What it was.** `claude-opus-5` wrote the articles, at $5 / $25 per million input / output tokens: one to two dollars per article (with the programme comparison).
- **Why it went.** `claude-sonnet-5-5` does the job for $2 / $10, less than half.
- **Before you try again.** A bigger model is one variable away (`CLAUDE_MODEL`). Weigh it against 60–70 sitting days a year.

### Re-analysing everything on every rewrite

*2026-09-25 (`e3e829e`) – 2026-09-30 (`7a9c05d`) · 5 days*

- **What it was.** The clock rewrites an article when DIP adds decisions or the plenary protocol comes out, and every rewrite analysed every decision again, at full price.
- **What took its place.** Each analysis carries a key over everything it was written from; a rewrite keeps the analyses (and the title and introduction) whose inputs have not changed. The admin's *neu schreiben* still writes everything anew.

### The first name of the site

*2026-09-25 (`e3e829e`) – 2026-09-26 (`d28a6b4`) · 20 hours*

- **What it was.** "Versprochen & Beschlossen", the default of `SITE_NAME`.
- **Why it went.** No reason is recorded.
- **What took its place.** "Wahlwort". `SITE_NAME` still overrides it.

### The home page hero

*2026-09-25 (`e3e829e`) – 2026-09-26 (`d28a6b4`) · 20 hours*

- **What it was.** A stone-coloured card with two decorative circles, the claim and the buttons "Kostenlos registrieren" and "Mitmachen", above the latest article.
- **What took its place.** The scroll through the plenary hall.
- **Left behind.** The `.hero` rules in `static/styles.css`, unused (`.hero-actions` is still used by the landing page).

### Waiting for twelve quiet hours

*2026-09-25 (`e3e829e`) – 2026-09-25 (`9aabb6b`) and 2026-09-26 (`d28a6b4`) · 1½ hours, the rest a day later*

- **What it was.** An article was written only once a sitting day's DIP data had not changed for 12 hours, and the first run looked back 10 days.
- **Why it went.** After the first deploy the site stayed empty: every decision looked just fetched, so nothing ever counted as settled, and the window missed older weeks. Worse, DIP's positions were grouped without sorting, so an unchanged day looked changed on every hourly sync.
- **What took its place.** A day two days old counts as complete whatever its fetch time; yesterday's sitting is written the next morning; the first run looks back four weeks and writes the latest sitting week; positions are sorted before grouping.
- **Before you try again.** On a fresh deploy everything looks new. A rule that waits for "unchanged for N hours" needs a fallback by age.

### Traffic-light verdicts and a navy accent

*2026-09-25 (`e3e829e`) – 2026-09-25 (`a63fe89`) · 36 minutes*

- **What it was.** Verdicts as green, yellow and red chips; buttons and the brand mark in navy (`#1d3557`).
- **Why it went.** In Germany almost every hue is claimed by a party (green and red are the Grüne and the SPD), and alarm colours agitate readers.
- **What took its place.** Warm paper and stone tones with a charcoal ink; meaning carried by shape (see *Design* in the README).
- **Before you try again.** Don't. Any colour coding of a result or a vote reads as a party colour.

### The static prototype

*2026-09-25 (`04ba9ed`) – 2026-09-25 (`e3e829e`) · 3 hours*

- **What it was.** "Bundestag Plenum Tracker", written by GitHub Copilot: a static `index.html` with hand-written sample data (`data/plenums.json`, `data/vote-brochures.json`, with parties called "Party A" and "Party B") and a "divergence score" from 0 (aligned) to 1 (strongly diverging): worked out from how many keywords a decision shared with the closest topic of an election brochure.
- **Why it went.** Sample data, and a score of overlapping keywords says nothing about whether a decision matches a position.
- **What took its place.** The Node server with real data from DIP, written up by Claude.

---

## Template

```markdown
### <Name>

*<born> (`<commit>`) – <buried> (`<commit>`) · <lifetime>*

- **What it was.**
- **Why it went.**
- **What took its place.**
- **Left behind.** Tables, redirects, helpers or styles that are still there.
- **Before you try again.** What to know or answer first.
```

Leave out a line that has nothing to say. Add a row to *At a glance*.
