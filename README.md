# Wahlwort

What the Bundestag decides, explained.

After every sitting day of the German Bundestag, this site publishes an article that goes through the day's decisions in plain language: what was decided, what it means, and how each parliamentary group voted. Every decision links to its documents (the Drucksachen and the plenary protocol). Readers can register, comment on the articles, get each article by email, and share an article or a single decision (see *Sharing* below). Each article also goes out on Instagram as a carousel once the votes are known (see *Instagram* below).

Earlier versions also compared every decision with the parties' election programmes. That is gone: a parliament that only ever did what the programmes say could not form coalitions or find compromises, so measuring decisions against them told readers less than it seemed to. That and everything else the site has dropped is in [GRAVEYARD.md](GRAVEYARD.md): what it was, when it went, and why. Look there before planning something new.

The **/vorschau** page looks ahead: the agenda of the coming sitting days, with the items that end in a vote first (see *The preview* below).

The **/bundestag-erklaert** page (*Grundlagen* in the menu) explains, for readers without any background, how the Bundestag decides: what the results on this site mean, the way of a bill from first reading to coming into force, motions and other decisions that are not laws, how votes and majorities work, who else takes part, and a short glossary. In every article, each decision carries a short **"Was heißt das?"** that says what its result means: a bill the Bundestag passed still has to go through the Bundesrat and the Federal President (with a small diagram of that way), an adopted motion is no law, a rejected one is the usual case. That text is written by hand in `src/views/explainer.js` from the decision's Vorgangstyp, result and readings, not generated, so it also works for articles written before it existed.

The site is also meant to leave people calmer and more capable, not more agitated. Where a decision gives readers something concrete to do, it ends with **"Was du tun kannst"**: at most two steps that only make sense for this decision, mostly for yourself, rarely with others or in politics. General tips that would fit under any decision (ask your MP, sign a petition, talk about it) are not repeated there; they live on /mitmachen. It also says where the parliamentary groups agreed (**"Gemeinsamkeiten"**). The **/mitmachen** page collects practical, non-partisan ways to contribute: staying calmly informed, shopping with impact, everyday democracy, and community.

The site itself is in German. Code and docs are in English.

## How an article is made

```
DIP API ──► decisions (grouped per Vorgang and day) ──► details: abstract, Drucksache, vote formula from the plenary protocol
                                                                        │
         Claude explains each decision (structured JSON): what was decided, the result, each group's vote, what readers can do
                                                                        │
         checks: every group gets exactly one vote from a fixed list; without the protocol every vote is "unbekannt";
                 suggestions link only to the curated list
                                                                        │
         Claude writes headline, lede and introduction for the day
                                                                        │
         article stored as JSON ──► rendered page, RSS, newsletter
```

- **Decisions** come from the Bundestag's documentation system [DIP](https://dip.bundestag.de) (`/vorgangsposition`). A decision is a plenary position with a *Beschlussfassung*. Referrals to committee don't count, and the 2nd and 3rd reading of the same bill on the same day are merged into one. Bills and roll-call votes are ranked first. Petitions and elections go to a short list at the end.
- **How the groups voted** isn't in DIP's structured data. It is in the plenary protocol, in the President's vote formula ("mit den Stimmen der … gegen die Stimmen der …"). `src/protocol.js` finds these sentences next to the decision's Drucksache numbers and passes them to Claude, which turns them into one vote per group: *dafür*, *dagegen*, *enthalten*, *gespalten* or *unbekannt*. Until the protocol is out, every vote is *unbekannt*, whatever the model says.
- **Claude** (`claude-sonnet-5-5`, adaptive thinking, structured outputs) is called `1 + number of decisions` times per article. Requests opt into server-side refusal fallbacks (`fallbacks: "default"`), because parliamentary topics such as defence and extremism can trip a safety classifier.
- **Timing:** a built-in clock ticks every 15 minutes (the preview's agenda has its own schedule, see *The preview*). It fetches DIP hourly and never writes about the current day. Yesterday's sitting is written the next morning (from 06:00 Berlin time), or earlier once its data has stopped changing for 12 hours. DIP records a sitting's decisions over one or two days, so the article is rewritten as the rest arrives (once the new data has been quiet for 12 hours, or the day is two days old). If DIP adds decisions later, or the plenary protocol (with the votes) only appears after the article, the article is rewritten; the newsletter is not sent again. On the very first run the app looks back four weeks and writes the most recent sitting week, so a new site does not start empty. It stays quiet before 06:00 Berlin time and gives up on a date after 3 failures in 24 hours. Emails go out between 06:00 and 21:00, and only for sitting days of the last three days.

## The preview

`/vorschau` shows what the Bundestag is going to decide next, and the home page sums up the next sitting week in a card.

- **Source:** the official agenda, the data behind [bundestag.de/tagesordnungen](https://www.bundestag.de/tagesordnungen). The site loads it as JSON from `/apps/plenar/plenar/conferenceWeekJSON?year=…&week=…` (ISO calendar weeks); each answer names that week's sitting days and points to the next sitting week. No key is needed. The format follows the open-source [DEMOCRACY](https://github.com/demokratie-live/democracy-development) app, which reads the same address. `src/agenda.js` is the only place to adjust if a field is named differently; `npm run agenda:probe` shows what comes back.
- **Which items are votes** is not a field, it is in the agenda's wording: *Zweite und dritte Beratung* of a bill, *Beratung der Beschlussempfehlung* of a committee, elections, the budget's *Einzelpläne* and the *Abschließende Beratungen ohne Aussprache* end in a vote; *Erste Beratung* and *Überweisungen im vereinfachten Verfahren* end in a referral to committee. A motion without a committee report (*Beratung des Antrags*) is usually referred, so it is listed under "Abstimmung möglich". Checked against 173 agenda weeks of the 18th and 19th Bundestag: of the items marked as a vote, 99.8 % were voted on; 87 % of all votes were marked as one, and 96 % as a vote or a possible one. Items with several parts ("a) … b) …") are split, since a first reading and a final vote often share one item.
- **Timing:** the clock fetches the current week and the next two sitting weeks every two hours (recess weeks are skipped within a small request budget). A day that disappears from the agenda is removed; a day not confirmed for a week is no longer shown. `AGENDA=off` switches it off.
- **Folded items:** every item with a vote is a fold. Closed, it shows the time, the title, what is decided and one line on what it is about; open, the summary, the other Drucksachen debated with it ("Gemeinsam beraten"), the result once the Bundestag has voted, and the agenda's own wording (folded once more). For each part of an item, `gistOf` in `src/agenda.js` reads from the agenda's wording what it is (Antrag, Gesetzentwurf, Petitionen, EU-Vorhaben …), who brought it in, and its own title, so a bundle of votes without debate lists "Natur erleben, Umwelt schützen – Antrag · Grüne" instead of "Beratung der Beschlussempfehlung und des Berichts des Ausschusses für …"; a dozen petition overviews become one line.
- **Where a bill goes next:** a first reading ends with the bill being referred to committees. The agenda names them ("Überweisungsvorschlag"); the preview lists them, with the lead committee ("(f)") written out as *federführend* and the others as *mitberatend*. The glossary on /bundestag-erklaert explains both.
- **"Aus dem Ausschuss":** before the second and third reading, the agenda names the committee's report ("Beschlussempfehlung und Bericht"). That report is summarised too, with its own prompt: what the committee recommends, what it changed in the bill, whether it heard experts, and how the groups voted in it. A long report goes in as its opening plus the account of the deliberations ("Bericht der Abgeordneten"), which often only comes after a long table of changes. For a motion debated alongside, the preview shows the committee's recommendation in one line.
- **"Worum es geht":** for the big items (bills, committee reports, motions, first readings; not the bundles of votes or referrals without debate) the preview shows a short summary of the Drucksache behind each part – one sentence (`kurz`) for the closed item, up to three for the open one – written by `claude-haiku-5-5` (`SUMMARY_MODEL`) from the opening of its text in DIP. For a bill that opening is the Vorblatt (problem, solution, alternatives, costs), the summary the Bundestag puts in front of every bill; the text is capped at 60,000 characters, so every request stays under the 100K-token price step of Haiku. Each Drucksache is summarised once and stored (`drucksache_summaries`); one that comes back later costs nothing. Raising `SUMMARY_VERSION` in `src/summaries.js` writes the stored ones again with the new prompt; until then the old ones stay on the page. The clock writes at most `SUMMARY_MAX_PER_RUN` (30) per tick; a text not yet in DIP is tried again after 12 hours, at most five times. The page marks them as AI summaries and links the original. Expect a few dollars a year. `SUMMARIES=off` switches them off; the admin page shows their token count.

## Sharing

Every article has a **Teilen** button in its header, and every decision one at the end of its fold. It opens a sheet as apps have it: what is being shared (date, headline, result), round buttons for *Link kopieren*, WhatsApp, Telegram, E-Mail, Bluesky, X and Facebook, *Mehr …* for the device's own share menu where the browser has one, and the address to copy. On phones it slides up from the bottom edge, on wide screens it is a window in the middle.

- **A decision has its own address,** `/artikel/<date>/beschluss/<id>`. It shows the article with that decision open and scrolls to it, and gives messengers and networks a card of its own (title: the decision's headline and the day; description: its result and summary). Its canonical address is the article's, so search engines see one page. The number is the decision's id, not its place in the article, so a shared link stays right when a rewrite adds a decision; one a rewrite has dropped leads to the article.
- **No widgets, no tracking.** The services are plain links, so nothing loads from them until someone taps one, and no service gets to know who reads what. Their marks ([Simple Icons](https://simpleicons.org), CC0) are drawn in the page's ink, not in brand colours (`static/share-icons.svg`).
- **Works without JavaScript.** The sheet is a native `<details>`; a tap beside it closes it. `static/share.js` adds copying, *Mehr …*, a close button, Escape, and one sheet at a time.

## Instagram

With `INSTAGRAM_ACCESS_TOKEN` set, every article also goes out on Instagram as a carousel: a cover with the day's title and lede, one picture per decision (headline, result, summary, and each group's vote in seat order, told apart by shape as on the site), and a last picture with the *Gemeinsamkeiten* and the article's address. The caption has the title, the lede, the list of decisions, "Link in der Bio" (links in a caption cannot be tapped), a note that the texts are written by an AI, and `#Bundestag #Politik`.

- **When:** once the plenary protocol is in and the article has been rewritten with the votes – usually a day or two after the sitting, so no picture ever shows a vote as *unbekannt*. At most a week after the sitting, one article per tick, between 06:00 and 21:00 Berlin time. An article goes out once: a later rewrite is not posted again. It is marked just before it is published, so a run that dies halfway never posts it twice; if Instagram does not answer the final request at all, the article is not tried again (better a missing post than a double one). Three failures in 24 hours pause an article for the day; each step is in the admin's *Protokoll*.
- **The pictures** (`src/views/slides.js`) are SVG in the site's palette and fonts, rendered with [resvg](https://github.com/thx/resvg-js) and saved as JPEG at 1080 × 1350, the tallest format the feed shows (Instagram takes JPEG only). Long texts get a smaller size, then end in "…"; a long compound is broken at its joining s ("Beschaffungs-|beschleunigungsgesetz"). A carousel holds at most ten pictures, so at most eight decisions. The pictures are served at `/instagram/<date>/<n>.jpg`, where Instagram fetches them – `BASE_URL` has to be the site's public https address. Admins see every carousel and its caption, before and after it goes out, under *Bilder* in the admin's article table.
- **Fonts:** resvg draws a variable font only in its default cut, so `static/fonts` also holds static TrueType cuts of the site's fonts, made with fontTools' instancer: Fraunces at wght 560 and SOFT 100 (the headings' settings), Figtree at 400 and 600, each with its own name and weight class so resvg tells them apart. They are not served to browsers.
- **Setting it up:**
  1. A professional Instagram account (Business or Creator) for the site. A business profile in Germany needs an *Impressum* too: link `/impressum` in its bio.
  2. A Meta app on [developers.facebook.com](https://developers.facebook.com) with the product *Instagram*, *API setup with Instagram login*. Under *Generate access tokens*, add the account and log in with it; the token comes with the permissions `instagram_business_basic` and `instagram_business_content_publish`. An app that only posts to accounts with a role in it needs no App Review.
  3. Copy the token (a long-lived one, 60 days) into `INSTAGRAM_ACCESS_TOKEN`. The clock renews it every week, also through the recess, and keeps the renewed one in the database; the admin page shows until when it is valid. A new token set by hand replaces the stored one.

## Design

- **Politically neutral colour.** Warm paper and stone tones with a charcoal ink. Almost every hue is claimed by some party in Germany (black, red, green, yellow, blue, purple, magenta, orange, turquoise), so the site uses none of them. Party colours appear only as a small identification dot, the same size for every party. The groups are listed in the order they sit in the plenary hall (left to right as seen from the President, `src/plenum.js`).
- **Shapes instead of colours.** A vote is told apart by its shape: *Ja* is a filled pill, *Nein* an outlined one, *Enthaltung* dashed, *uneinheitlich* dotted. Results work the same way: adopted = filled, rejected = outlined, settled = dashed. Nothing depends on colour alone, which also works in greyscale, for colour-blind readers, and in dark mode. The logo is the plenary hall's three rows of seats, seen from above.
- **Calm by default.** Soft rounded shapes, generous whitespace, sentence case, no alarm colours.
- **Type.** [Fraunces](https://github.com/undercasetype/Fraunces) (soft axis) for headings and [Figtree](https://github.com/erikdkennedy/figtree) for text. Both are served from `static/fonts` under the SIL Open Font License, so nothing loads from Google.
- **Only curated links.** "Was du tun kannst" may link only to entries in `src/resources.js`, and not to the general ones marked there (MPs, petitions, reading up); the JSON schema Claude answers with enforces that, and older articles have suggestions with such links hidden. The /mitmachen content lives in `src/mitmachen.js`.

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
   | `SITE_NAME` | optional, the name shown everywhere (default *Wahlwort*) |
   | `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | optional, the `content` value of the verification meta tag from Google Search Console / Bing Webmaster Tools |
   | `INDEXNOW_KEY` | optional, any 8–128 letters, digits or dashes; new articles are then announced to Bing & Co. at once via IndexNow |
   | `PLAUSIBLE_DOMAIN` | optional, a second, external statistics view with [Plausible](https://plausible.io) (cookieless). The built-in statistics need nothing |
   | `INSTAGRAM_ACCESS_TOKEN` | optional, posts every article to Instagram as a carousel (see *Instagram*) |
4. **Networking → Generate Domain.** `BASE_URL` defaults to that domain. **Custom domain:** add it under *Networking → Custom Domain*, create the CNAME (and TXT) record Railway shows at your registrar, then set `BASE_URL=https://your-domain.de`. From then on the Railway address and `www.` answer with a permanent redirect to it, so search engines index every page once.
5. Open the site, **register with an address from `ADMIN_EMAILS`**, and go to **/admin**.
6. **Check DIP:** in the Railway shell (or locally with the key), run `npm run dip:probe -- 2026-09-24 --raw` for a recent sitting day. Then press *Jetzt aktualisieren* in the admin area. To write an article right away, use *Artikel für Sitzungstag erzeugen*.
7. **Review `/datenschutz`** (a template) before going public.
8. **Search engines:** add the site in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) and submit `/sitemap.xml` (Google News also reads `/news-sitemap.xml`). Search terms only show up there.

## Visitors and search engines

- **Statistics** (`/admin/statistik`): the server counts the pages it delivers to people – no cookie, no script, no third party. A visit is told apart by a hash of IP address, browser and a salt that is replaced and deleted every day, so nobody can be recognised across days. Bots and admins are not counted. It shows visits per day, pages, referrers (Google, Bluesky, …), `utm_source` campaigns (the newsletter links carry `utm_source=newsletter`) and devices. Raw rows are deleted after about 400 days.
- **SEO:** every page has a description, a canonical address (query strings never make a second one), Open Graph and Twitter cards with `static/og.png`. Articles carry `NewsArticle` and breadcrumb structured data and the sitting date in their title; the landing page carries `WebSite`, `Organization` and `FAQPage`. `/sitemap.xml`, `/news-sitemap.xml`, `/robots.txt`, `/feed.xml` and a web app manifest are generated from the database.
- **The landing page** (`/`) is a scroll through the plenary hall, drawn by `static/landing.js` on a canvas without any library: it starts above the seating plan of the 21st Bundestag and ends at the lectern, with one camera view per text card and the camera gliding after the scroll. The hall is never quiet: lines of debate arc from seat to seat, always across an aisle, and every line is answered – democracy as people who keep talking to each other. During the vote (card 3) the hall falls silent and the seats light up row by row; at the lectern the reader is part of the conversation. A click on a seat lets it speak. The animation only runs while the hall is on screen. Readers who prefer reduced motion get the still plan with a few finished exchanges; without JavaScript, a small SVG plan and the text.

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
| `npm run agenda:probe -- [2026-10-05] [--raw]` | what the Bundestag's agenda returns for the coming weeks and which items the preview counts as votes. Read-only |
| `npm run generate -- 2026-09-24 [--force] [--mail]` | (re)write one day's article |

## Layout

```
server.js            HTTP server + clock
src/app.js           routes, forms, sessions, CSRF (Origin check), admin actions
src/articles.js      the article pipeline and its checks
src/dip.js           DIP client, decision extraction, sync
src/protocol.js      vote formulas from the plenary protocol
src/agenda.js        the agenda of the coming sitting days, and which items are votes
src/summaries.js     "Worum es geht" and "Aus dem Ausschuss": short summaries of the Drucksachen on the agenda
src/plenum.js        the parliamentary groups, in the order they sit
src/claude.js        Claude calls (structured output, fallbacks)
src/newsletter.js    daily email, sent at most once per person
src/scheduler.js     the 15-minute tick
src/mitmachen.js     content of the /mitmachen page
src/resources.js     the only links suggestions may point to
src/views/           server-rendered pages (everything escaped by default)
src/views/shapes.js  the logo and small marks
src/views/agenda.js  the preview page (/vorschau) and its card on the home page
src/views/explainer.js  the explainer (/bundestag-erklaert) and the "Was heißt das?" of each decision
src/views/share.js   the share sheet of articles and decisions
src/views/slides.js  an article as Instagram pictures
src/instagram.js     posting to Instagram, and keeping its token alive
src/analytics.js     cookieless visitor statistics
src/seo.js           robots.txt, sitemaps, manifest, IndexNow
static/landing.js    the plenary hall animation on the landing page
static/share.js      what the share sheet does with JavaScript: copy, the device's share menu, Escape
static/share-icons.svg  the share sheet's icons
static/fonts/        self-hosted fonts (SIL OFL), and static cuts of them for the Instagram pictures
test/                node:test suites with PGlite and fake Claude/DIP/mail
GRAVEYARD.md         features and approaches the site has dropped, and why
```

## Good to know

- **Cost:** 1 + N Claude calls per sitting day, where N is at most 8 decisions. Expect well under a dollar per article with `claude-sonnet-5-5` (the analyses at effort `high` are most of it, their output mostly thinking). A rewrite sends only what changed to Claude again: an analysis whose inputs (the decision, its documents and vote sentences, the prompt) are unchanged is kept, and so are title and introduction if nothing they summarise changed. Once the protocol arrives, every decision is analysed again, since the votes are new input for all of them. The admin table shows the tokens of all versions of an article together; *neu schreiben* in the admin area writes everything anew. The Bundestag sits on roughly 60–70 days a year.
- **Older articles:** an article written by an earlier version of the pipeline (`ARTICLE_VERSION` in `src/articles.js`; version 1 compared decisions with the election programmes) is written anew by the clock, newest first, one per tick and only when nothing more urgent is due. Each costs about as much as a new article, and the newsletter is not sent again. Until then it is shown without the programme comparison. The tables of the old library (`programs`, `program_chunks`, `article_citations`) are left in the database, unused.
- **DIP's response format** is implemented from its documentation and hasn't yet been exercised against the live API from this codebase. `npm run dip:probe` is the quickest way to confirm, and `src/dip.js` is the only place to adjust if a field is named differently.
- **Instagram** is implemented from Meta's documentation of the Instagram API with Instagram Login (Graph API v26.0) and tested against a fake; the first real post is the check. `src/instagram.js` is the only place to adjust, and the admin's *Protokoll* shows Instagram's own error messages.
- **Comments** need a confirmed email address when mail is configured. Admins can delete any comment, users their own. Account deletion removes the user's comments.
