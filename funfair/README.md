# Starlight Funfair

An idle funfair-management game that runs in the browser. Open attractions, tap **GO!** to serve your first guests, hire operators so the fair runs itself, pop prize balloons, set off fireworks, and take the whole show on tour to earn fame.

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
| Attractions | Twelve plots, opened in order, from the Toffee Apple Cart to the Comet Coaster. Each level raises its ticket price; star milestones (levels 10, 25, 50, 75, 100, ...) double it and add seats and speed. |
| Guests | Simulated people walk in through the gate, pick an attraction, queue, ride, pay and move on. Takings come from the guests actually served, so marketing, wristbands and paths all matter. |
| Operators | Without one, an attraction waits for you to tap GO!. With one, it runs itself and keeps earning while you are away. |
| Park office | Fair-wide cash upgrades: marketing (more guests), wristbands (more rides each), paved paths (faster walking), fairy lights (dearer tickets). |
| Boosts | Fireworks triple takings for 30 seconds on a cooldown. Prize balloons drift past with cash, a rush-hour boost or a star. |
| Goals and stars | One goal is always active and pays stars. Stars buy permanent upgrades in the Star shop. |
| Tours | Pack up for the next town to bank fame, a permanent ticket multiplier. Cash, attractions and park upgrades stay behind; fame, stars and Star shop upgrades come with you. Five towns, each with its own look. |
| Away earnings | Operated attractions earn while the game is closed, up to a cap that the Night Crew upgrade extends. |

The game saves to `localStorage` every ten seconds and whenever the tab is hidden. Settings has a save code for moving a game between devices.

## Code map

```
index.html            page shell
css/style.css         HUD, sheets, modals
js/config.js          all game data and tuning numbers
js/economy.js         pure maths: costs, prices, multipliers, fame
js/sim.js             the simulation and every player action (no DOM)
js/goals.js           scripted and generated goals
js/state.js           save state, validation, export codes
js/format.js          number and time formatting
js/art.js             every picture, as canvas drawing code
js/render.js          camera, scenery, lighting, particles, map labels
js/ui.js              HUD, navigation, sheets, modals, toasts
js/audio.js           sound effects and the organ waltz
js/main.js            boot, frame loop, saving, event feedback
tests/                unit tests for the logic layer
tools/balance.mjs     a bot that plays the real simulation to check pacing
```

`config.js`, `economy.js`, `sim.js`, `goals.js`, `state.js` and `format.js` never touch the DOM, which is what lets the tests and the balance bot run them in Node.

## Tests and tuning

```sh
npm test            # node --test, no install needed (Node 20+)
npm run balance     # greedy bot, prints when each attraction and tour is reached
node tools/balance.mjs 6 42   # hours to simulate, random seed
```

With the current numbers the bot opens attractions two to eight at roughly 2, 6, 10, 15, 20, 25 and 39 minutes, tours for the first time at about an hour, and has built all twelve by its third town. A person plays slower than the bot. To retune, change `config.js` and run the bot again; `RC` and `RP` environment variables let you try different cost and price ratios per tier without editing anything.

Useful while developing: add `?speed=10` to the URL to fast-forward, and `window.funfair` exposes the live world, simulation and renderer in the console.
