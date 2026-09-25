# bundestag

A minimal static prototype that:

- loads latest plenum decisions (`/data/plenums.json`)
- loads vote-brochure material (`/data/vote-brochures.json`)
- computes a topic-based divergence score between decisions and brochure positions

## Run

Open `index.html` in a local static server, for example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Test

```bash
npm test
```
