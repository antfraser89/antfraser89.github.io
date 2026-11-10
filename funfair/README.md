# Starlight Funfair

A spin-and-build funfair game for the browser. Spin a lucky machine for coins, build a living fair with them, throw pies at rival showfolk, raid their lucky dips, collect cards and look after Chips the gull. Finish a fair and the whole show moves to the next town.

It follows the "spin and build" formula of mobile games such as Carnival Tycoon, with its own name, art, cards and towns, and without the adverts, purchases or pop-ups. It is original work, not a copy of any of those games.

Play it at `https://antfraser89.github.io/funfair/` once this folder is on the default branch.

No build step, no dependencies, no image or sound files: the art is drawn with canvas paths and the audio is synthesised with Web Audio. The folder is self-contained, so it can be moved to its own repository as-is.

## Run it locally

ES modules need to be served over HTTP, so open it through any static server:

```sh
cd funfair
python3 -m http.server 8080   # or: npm run serve
# then visit http://localhost:8080
```

## How the game works

| System | What it does |
| --- | --- |
| Tokens | The spin currency. One comes back every two minutes up to a cap of 60 (Chips raises it). Prizes can push you over the cap. |
| The machine | Three reels. Coins and sacks pay on every spin; three of a kind triggers a pie attack, a lucky dip, a padlock, free spins, chips for the gull or the jackpot. The bet (×1 to ×50) multiplies both the cost and the prize. |
| Building | Each town has six attractions, each built up through five stars with coins. Stars add decoration, draw more guests, and pay bonuses (tokens at three stars, a card pack at five). All six at five stars finishes the fair: a gold pack, 25 tokens and a new town with a new look and line-up. |
| Pies | Three pies on the reels: pick one of a rival's attractions to splat. It pays less if the rival had a padlock. |
| Lucky dips | Three tubs on the reels: the rival's takings are hidden in three of four tubs and you get three goes. |
| Padlocks | Rivals throw pies back, mostly while you are away. A padlock stops one; otherwise an attraction closes until you pay to clean it, and you get one free pie back at the culprit. Never more than two closures per absence. |
| Cards | 54 cards in six sets of nine, rated one to five stars, the five-star card in each set being gold. Packs come from upgrades, finished fairs, jackpots, events and coins. Finished sets pay tokens; the finished album pays 500 and starts a new season. |
| Star vault | Spare cards become stars, and stars buy cards you are guaranteed not to own, including missing gold cards. A pack is also topped up with a new card after two packs in a row with nothing new. |
| Chips | The fair's gull. Feed him chips won on the machine to level him up: each level pays tokens, raises the token cap and adds 5% to lucky dips. |
| Events | A two-day spin event with twelve milestone prizes, and a daily league against the rival showfolk scored on pies and lucky dips. |
| The gate | Guests really do walk in, queue, ride and pay. Their takings trickle in while you play and for up to three hours while you are away. |
| Missions and gifts | One mission is always active, and there is a gift each day on a seven-day cycle. |

The game saves to `localStorage` every ten seconds and whenever the tab is hidden. Settings has a save code for moving a game between devices.

## Code map

```
index.html            page shell
css/style.css         HUD, the machine, sheets, mini-games, modals
js/config.js          all game data and tuning numbers
js/economy.js         pure maths: units, costs, bets, the gate
js/rules.js           spins, rivals, building, cards, pet, events, league, daily gift
js/sim.js             the living fair: guests, queues, rides, balloons
js/goals.js           missions
js/state.js           save state, validation, export codes
js/format.js          number and time formatting
js/art.js             attractions, scenery, slot symbols, decorations
js/cardart.js         the 54 card paintings and the card frame
js/render.js          the fair canvas: camera, lighting, particles, labels
js/slotview.js        the reels
js/ui.js              HUD, the machine dock, sheets, mini-games, modals
js/audio.js           sound effects and the organ waltz
js/main.js            boot, frame loop, saving, time away
tests/                unit tests for the rules
tools/balance.mjs     a bot that plays the real rules to check pacing
```

Everything except `render.js`, `slotview.js`, `ui.js`, `cardart.js`, `audio.js` and `main.js` runs without a browser, which is what lets the tests and the balance bot use the real rules.

## How the numbers hang together

Every payout and price in a town is a multiple of that town's coin "unit" (`economy.unit`), which grows 1.55× per town. `economy.spinEV()` works out what an average spin returns from the outcome table in `config.js`, and each town's 30 upgrades are priced to add up to a target number of spins (`economy.townSpins`: 40 for the first town, 110 for the second, rising from there). Change the outcome weights or payouts and the prices follow automatically.

```sh
npm test                      # node --test, no install needed (Node 20+)
npm run balance               # a bot plays 7 days at 4 sessions a day
node tools/balance.mjs 14 2   # days, sessions per day
```

With the current numbers the bot finishes the first fair in about 26 spins, reaches the sixth town on day one, the twelfth after a week, and completes the album around day ten. A test checks that 60,000 simulated spins pay within 6% of what `spinEV()` predicts.

Useful while developing: `?speed=60` runs the clock sixty times faster (tokens, events, rivals), and `window.funfair` exposes the live state, rules and renderer in the console.
