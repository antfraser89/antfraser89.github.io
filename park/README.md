# Park!

A spin-and-build theme park game for the browser. Spin a lucky machine for coins, build a living park with them, throw pies at rival showfolk, raid their lucky dips, collect cards and look after Chips the gull. Finish a park and the whole show moves to the next town.

It follows the "spin and build" formula of mobile games such as Carnival Tycoon, with its own name, art, cards and towns. It is original work, not a copy of any of those games.

Play it at `https://antfraser89.github.io/park/` once this folder is on the default branch.

No build step. The park is rendered in real-time 3D with [three.js](https://threejs.org) (MIT licence), which is vendored in `js/vendor/` so nothing has to be installed; every model is built in code from simple solids, the audio is synthesised with Web Audio, and the only thing fetched from elsewhere is the type (Lilita One and Baloo 2, from Google Fonts). The folder is self-contained, so it can be moved to its own repository as-is.

## Run it locally

ES modules need to be served over HTTP, so open it through any static server:

```sh
cd park
python3 -m http.server 8080   # or: npm run serve
# then visit http://localhost:8080
```

## Finding your way round

A tab bar runs along the bottom of the screen.

| Tab | What is there |
| --- | --- |
| Slots | The lucky machine, on a page of its own: three tall reels, the token meter set into the cabinet, the bet, and the spin button. The sign on top shows the jackpot and counts up each win. This is where the game opens. |
| Park | The living park, on a map that changes with the town. Tap an attraction or the Build button to spend coins; Chips and the rivals' news are here too. |
| Album | Card packs, the six sets and the star vault. Tap a card for a closer look. |
| Events | The spin event's prizes and the daily league table. |
| Shop | Tokens, bundles and the free-token advert. |

Coins, padlocks and the current mission stay on screen everywhere. On a wide screen the same pages simply get more room, and a phone on its side puts the reels beside the controls.

## The parks

Each kind of town has its own map, and guests really walk it: they follow the paths from the gate, keep to the right, queue along the promenade and step off rides into an exit lane.

| Town | The map |
| --- | --- |
| Village green | A promenade looping round a formal garden with a fountain, and a lake across the top with a bandstand on an island. |
| Seaside | Two attractions on the sand and four out on the arms of a pier, with a pavilion at the pier head, surf on the beach and boats offshore. |
| Common | The same loop with a bonfire at its heart, an orchard and a bandstand lawn in place of the lake. |
| Winter | A frozen lake with skaters, and a lit fir where the fountain would be. |
| Canal town | Cobbled quays either side of a canal, two bridges, strings of paper lanterns and barges working up and down. |

The park is a real 3D scene. Every attraction is a model with moving parts: the big wheel turns with its cars hanging level, the carousel's horses rise and fall, the coaster train runs its loop, dodgems wander their floor. Guests are little figures walking the paths; trees, lamps, fences, the domed gate and the pier's legs are all solid. Crown banners hang from the lamp posts, flowering hedges line the paved promenades, every ride has its name on a board and a roped-off queue, and beyond the fence there are hills, clouds and hot-air balloons. One sun lights it and everything casts a shadow. Water sits below the level of the ground and catches the light.

Drag to pan, pinch or scroll to zoom, twist with two fingers (or shift-scroll, or drag with the right button) to turn the view; there are two buttons on the park page that turn it an eighth of a circle. Pulled back, the camera looks down on the whole park; close in, it drops low enough to look across it to the horizon.

On a device without WebGL the game falls back to a flat renderer that draws the same map with painted sprites in perspective. Add `?flat` to the address to see it.

The day runs from soft daylight through a long golden hour to a lamp-lit night. Shadows lengthen as the sun drops and every lamp, ride and lantern throws its own light after dark.

## The look

The style follows the Park! style guide: sky blue and sunshine yellow, cream counters with brown lettering, chunky rounded type (Lilita One and Baloo 2), and glossy buttons with a solid edge underneath. The logo is the yellow wordmark on a blue badge with a golden ticket. Panels are royal blue with cream tiles; pop-ups are cream cards in a blue frame. The slot machine is a red cabinet with a big red SPIN button on a grey stand. The tab bar is a cream tray with the current tab raised in orange.

The park's host is a panda in a blue cap and waistcoat with a yellow bow tie. He is a 3D model: he waves people in at the gate, and his portrait on the splash screen, the welcome card and the slots page is rendered from the same model.

All of this is the last section of `css/style.css` (everything above it is layout), so the palette and type can be changed in one place.

## How the game works

| System | What it does |
| --- | --- |
| Tokens | The spin currency. One comes back every two minutes up to a cap of 60 (Chips raises it). Prizes can push you over the cap. |
| The machine | Three reels. Coins and sacks pay on every spin; three of a kind triggers a pie attack, a lucky dip, a padlock, free spins, chips for the gull or the jackpot. The bet (×1 to ×50) multiplies both the cost and the prize. |
| Building | Each town has six attractions, each built up through five stars with coins. Stars add decoration, draw more guests, and pay bonuses (tokens at three stars, a card pack at five). All six at five stars finishes the park: a gold pack, 25 tokens and a new town with a new look and line-up. |
| Pies | Three pies on the reels: pick one of a rival's attractions to splat. It pays less if the rival had a padlock. |
| Lucky dips | Three tubs on the reels: the rival's takings are hidden in three of four tubs and you get three goes. |
| Padlocks | Rivals throw pies back, mostly while you are away. A padlock stops one; otherwise an attraction closes until you pay to clean it, and you get one free pie back at the culprit. Never more than two closures per absence. |
| Cards | 54 cards in six sets of nine, rated one to five stars, the five-star card in each set being gold. Packs come from upgrades, finished parks, jackpots, events and coins. Finished sets pay tokens; the finished album pays 500 and starts a new season. |
| Star vault | Spare cards become stars, and stars buy cards you are guaranteed not to own, including missing gold cards. A pack is also topped up with a new card after two packs in a row with nothing new. |
| Chips | The park's gull. Feed him chips won on the machine to level him up: each level pays tokens, raises the token cap and adds 5% to lucky dips. |
| Events | A two-day spin event with twelve milestone prizes, and a daily league against the rival showfolk scored on pies and lucky dips. |
| The gate | Guests really do walk in, queue, ride and pay. Their takings trickle in while you play and for up to three hours while you are away. |
| Missions and gifts | One mission is always active, and there is a gift each day on a seven-day cycle. |
| Shop and adverts | Token bundles, coin and card bundles and an advert-removal purchase; opt-in adverts for free tokens and for doubling the gate takings after time away. See below for how they are connected. |

The game saves to `localStorage` every ten seconds and whenever the tab is hidden. Settings has a save code for moving a game between devices.

## Adverts and purchases

The game has the screens and the rules for both, and one seam where a real provider plugs in. Nothing in this folder takes money or shows a real advert.

Set `window.ParkBridge` before the game starts (a native wrapper such as Capacitor or an Expo WebView would inject it, or a web payment and advert integration can define it):

```js
window.ParkBridge = {
  showRewarded: async (placement) => true,     // 'tokens' or 'away'; resolve true only if the advert was watched
  showInterstitial: async (placement) => {},   // 'travel'; skipped once "No interruptions" is owned
  purchase: async (productId) => true,         // resolve true only after payment has succeeded
  prices: { tokens_s: '$0.99' },               // optional localised price labels by product id
};
```

Products and their placeholder prices are in `PRODUCTS` in `js/config.js`; what each one hands over is applied by `rules.applyPurchase` once `purchase` resolves true. Purchases are recorded in the local save only, so a real integration should also verify receipts and restore purchases on its side.

With no bridge present, `STORE_PREVIEW` in `js/config.js` decides what players see. While it is `true` (as now) adverts are a short stand-in and purchases are granted free with a clear "preview" notice, so every flow can be tried. Set it to `false` before going public without a provider: the shop then says it opens soon and advert buttons are disabled.

Because the game pairs a slot-style machine with paid spins, expect app stores to ask about simulated gambling in their age-rating questionnaires.

## Code map

```
index.html            page shell
css/style.css         HUD, tab bar, the machine page, the park page, sheets, mini-games, modals
js/config.js          all game data and tuning numbers
js/economy.js         pure maths: units, costs, bets, the gate
js/rules.js           spins, rivals, building, cards, pet, events, league, daily gift
js/layout.js          the map for each kind of town: paths, plots, water, and the guests' route network
js/sim.js             the living park: guests, queues, rides, balloons
js/world3d.js         the 3D park: scene, camera, sun and sky, water, labels, picking
js/geo.js             a kit for building models from simple solids, baked to one mesh each
js/models.js          the twelve attractions as 3D models, with their moving parts
js/props3d.js         3D scenery: trees, lamps, gate, bandstand, boats, pier legs, the crowd
js/vendor/            three.js (MIT)
js/goals.js           missions
js/state.js           save state, validation, export codes
js/format.js          number and time formatting
js/art.js             2D art: slot symbols, cards' attraction pictures, the flat renderer's sprites
js/scenery.js         landscape: water, bridges, piers, gardens, trees, boats, lamps
js/cardart.js         the 54 card paintings and the card frame
js/render.js          the painted ground (shared with the 3D park) and the flat fallback renderer
js/slotview.js        the reels, drawn as drums
js/fx.js              the coin shower
js/ui.js              HUD, tab bar, the machine and park pages, sheets, mini-games, shop, modals
js/audio.js           sound effects and the organ waltz
js/main.js            boot, frame loop, saving, time away
tests/                unit tests for the rules
tools/balance.mjs     a bot that plays the real rules to check pacing
```

Everything except the renderers (`world3d.js`, `geo.js`, `models.js`, `props3d.js`, `render.js`, `scenery.js`), `slotview.js`, `fx.js`, `ui.js`, `cardart.js`, `audio.js` and `main.js` runs without a browser, which is what lets the tests and the balance bot use the real rules.

## How the numbers hang together

Every payout and price in a town is a multiple of that town's coin "unit" (`economy.unit`), which grows 1.55× per town. `economy.spinEV()` works out what an average spin returns from the outcome table in `config.js`, and each town's 30 upgrades are priced to add up to a target number of spins (`economy.townSpins`: 40 for the first town, 110 for the second, rising from there). Change the outcome weights or payouts and the prices follow automatically.

```sh
npm test                      # node --test, no install needed (Node 20+)
npm run balance               # a bot plays 7 days at 4 sessions a day
node tools/balance.mjs 14 2   # days, sessions per day
```

With the current numbers the bot finishes the first park in about 26 spins, reaches the sixth town on day one, the twelfth after a week, and completes the album around day ten. A test checks that 60,000 simulated spins pay within 6% of what `spinEV()` predicts.

Useful while developing: `?speed=60` runs the clock sixty times faster (tokens, events, rivals), and `window.park` exposes the live state, rules and renderer in the console.
