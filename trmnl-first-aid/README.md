# First Aid Cards for TRMNL

A different first aid card on every refresh of your TRMNL: hands-only CPR, choking, recovery position, bleeding, stroke, burns, heat stroke and more.

- **129 cards** based on the 2025 American Heart Association guidelines and American Red Cross guidance, plus U.S. Army and FEMA training material for splints, bandages, carries, bites and stings, and home and disaster safety
- **4 languages**: English, German, French, Spanish
- **18 countries**: the emergency and poison control numbers adapt to the country you pick
- **125 illustrations**, converted for e-ink and credited on every card: line drawings from the U.S. Army ATP 4-02.11 (2026) and FM 21-11 (1991) and the FEMA CERT Basic Training manual (all public domain), and images from Wikimedia Commons
- Optional breast and testicular self-check cards (off by default)
- No API key, no server: static JSON on GitHub Pages

Catalog with every card and full image credits: https://nbbou81000.github.io/trmnl-first-aid/

**Not a substitute for first aid training.**

## How it works

`scripts/build.mjs`, run by the **Build cards** GitHub Action, downloads the images listed in `data/cards.json` from Wikimedia Commons, converts them for e-ink, and writes one polling file per language (`docs/cards-en.json`, `-de`, `-fr`, `-es`) plus the gallery. On TRMNL, `src/transform.js` (paste it in the plugin's Transform tab) picks one random card and one of its images on every refresh, and passes only that card to the Liquid templates. Without the transform, the templates fall back to their own rotation, but TRMNL may then skip re-rendering because the polled data never changes.

## Image sources

- U.S. Army, ATP 4-02.11 *Casualty Response, Tactical Combat Casualty Care, and First Aid* (March 2026), approved for public release: https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN46159-ATP_4-02.11-000-WEB-1.pdf
- U.S. Army, FM 21-11 *First Aid for Soldiers* (1991 change 2), approved for public release
- FEMA, *CERT Basic Training Participant Manual* (2019 update): https://www.ready.gov/cert
- Wikimedia Commons, each file with its own license

Figures from the manuals live in `data/images/`, described in `data/local-images.json`. Reference them in a card as `local:file-name.png`.

## Add or fix a card

Edit `data/cards.json` on GitHub. Each card has an `id`, a category, a list of Commons file names in `imgs`, and the title (`t`), situation (`w`) and steps (`s`) in each language. Write `{EMS}` for the emergency number and `{POISON}` for poison control. Saving the file runs the build automatically.

## Credits and licenses

Code: MIT. U.S. government figures are public domain. Commons images keep their own licenses (public domain, CC0, CC BY, CC BY-SA, CeCILL); author, license and source link for each one are in the catalog and in `docs/img/manifest.json`.

Made by Nicolas Bouteiller · [Ko-fi](https://ko-fi.com/nicolasbouteiller)
