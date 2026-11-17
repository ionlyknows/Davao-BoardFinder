# BoardFinder Davao

A web app for finding boarding houses, dorms, bedspaces, apartments and rooms across **Davao City**. It filters listings by budget, room type, who the room is for and open slots, then **ranks them with Insertion Sort**, nearest first or cheapest first, from any school, mall or barangay, or from any spot you tap on the map.

Course project for Algorithms (BSCS-2A). The graded algorithm lives in `src/core/algorithm.py`.

## Features
- **Full-screen interactive map** (Leaflet + OpenStreetMap) with numbered pins, clustering, landmark dots and an offline map when tiles cannot load.
- **Place search with suggestions** while you type: local landmarks, aliases (UM, AdDU, SPC, USeP...), barangays and loaded listings first, then Photon and Nominatim (OpenStreetMap) online.
- **Filters** behind one icon: budget, room type, who it is for, include fully booked rooms.
- **Step-by-step trace panel** (Next / Run All / Reset) that replays the Insertion Sort steps returned by the Python backend; the JavaScript never sorts.
- **Honest listings:** "Confirmed {date}" badge, "Availability not confirmed", "Pin is approximate", tap-to-reveal contact numbers, a scam-safety "Before you pay" checklist and a "Copy details" button.
- **Save** rooms, **Compare** up to 3, **Upload CSV**, **Export results**, and **+ Add Listing** (session only, nothing is stored on the server).
- **Data sets:** 50-row demo set, 52-row real-listings research set (`More > Use real listings (research)`), and the course test cases tc1-tc5 (`More > Test data`).
- Mobile friendly: the results become a draggable bottom sheet on phones; the results panel collapses to a single icon on desktop.

## How it works
1. **Filter** (linear pass, Theta(n)): keep listings that match budget, slots, type and gender, and compute each haversine distance.
2. **Insertion Sort** the matches by distance or rent (stable, in place; O(k^2) worst, Omega(k) best).
3. The API returns the ranked list, the full trace (when 50 or fewer rooms match) and exact comparison and shift counts.

Why Insertion Sort: result lists are small (rooms near one campus), the data is often nearly sorted, and the sort is stable and in place.

## Run locally
Requires Python 3.10+ (standard library only, no packages to install).
```powershell
cd src
python dev_server.py
```
Open http://127.0.0.1:8000. The map falls back to an offline SVG map when there is no internet.

## Tests and QA
From `src/`:
```powershell
python qa.py                                              # 8 checks, expect TOTAL 8/8
python -m unittest discover -s tests -p "test_*.py" -v    # 52 tests
```
`python qa.py --quick` runs checks 1-3 and `--core` runs checks 1-7.

## Deploy to Vercel
1. Import the repo and set the **Root Directory** to `src`.
2. Deploy. No `requirements.txt` is needed.
3. `vercel.json` bundles `core/**` and `data/**` with the API functions, serves `public/` as static files and sets the security headers.

## Project layout
```
src/
  core/        algorithm.py (Insertion Sort, haversine), validation.py, service.py, http_common.py, maps_links.py
  api/         rank.py, landmarks.py        (Vercel functions)
  public/      index.html, styles.css, app.js, map.js, trace.js
  data/        listings_demo.csv, listings_research.csv, listings_research_extras.csv, test cases tc1-tc5 + expected/
  tests/       unit and contract tests
  benchmarks/  bench_sort.py
  dev_server.py, qa.py, vercel.json
```

## CSV format
Header required, UTF-8: `listing_id, name, type, address, lat, lon, monthly_rent, available_slots, gender_policy, contact, last_updated, notes`.
- `type`: Bedspace, Boarding House, Dorm, Apartment or Room.
- `gender_policy`: Male, Female or Mixed.
- `lat`/`lon` must be inside Davao City (6.90 to 7.60, 125.20 to 125.75).
- Bad rows are skipped and listed with the reason; the app never crashes on bad input.

## Data and privacy
- The research set shows only what public sources published; unknown values are labelled, never invented. Please confirm availability and prices with the owner before paying anything.
- The app has no database and no accounts. Uploaded or added listings stay in your browser tab.
- Place search sends the text you type to OpenStreetMap-based services (Photon, Nominatim). Your location is never stored.

## Limitations
Straight-line (haversine) distance rather than road routes, manual CSV upkeep, no live Facebook sync, Davao City only, and place search that depends on free OpenStreetMap data.
