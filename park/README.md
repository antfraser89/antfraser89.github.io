# Park!

A spin-and-build theme park game for the browser. Spin a lucky machine for coins, spend them on the rides and facilities of a painted park, take turns on a prize wheel, dive for pearls, collect cards and look after Puddle the duck. Finish a park and the next one opens.

It is built in the "spin and build" genre of mobile games such as Carnival Tycoon, and its structure follows the research notes kept in the `park-game` repository. The name, mascot, parks, cards and artwork are Park!'s own.

Play it at `https://antfraser89.github.io/park/` once this folder is on the default branch.

No build step and nothing to install. The audio is synthesised with Web Audio, and the only thing fetched from elsewhere is the type (Lilita One and Baloo 2, from Google Fonts). The folder is self-contained, so it can be moved to its own repository as-is.

## Run it locally

ES modules need to be served over HTTP, so open it through any static server:

```sh
cd park
python3 -m http.server 8080   # or: npm run serve
# then visit http://localhost:8080
```

## How the screen is built

The game is laid out on a fixed stage of 390 × 847, the shape of the mock-up paintings, and the whole stage is scaled to fit the window. On a phone it fills the screen; on a wider window it sits in the middle over a soft-focus backdrop.

The two main pages use the mock-up paintings themselves as their backdrop, and every live control sits exactly over its painted counterpart:

| Page | Backdrop | What is live on top |
| --- | --- | --- |
| Slots | `img/slots.webp` | The reels (drawn on a canvas with the painted symbols), the event track on the sign, the bet, the spin meter, the SPIN button, the watch-an-advert button and the two rails of round buttons. |
| Park | `img/park-<theme>.webp` | The eight sites as tap targets with their level tags, the park name and progress bar, the map and takings buttons, coins popping out of sites as they earn, confetti and fireworks. |

The park starts in grey. Colour spreads out from each site as it is built and reaches further with every star, so a finished park is in full colour.

A tab bar runs along the bottom: **Offers**, **Park**, **Slots**, **Cards** and **Club**. Stars, coins, spins and the current task stay on screen everywhere.

On the Slots page the left rail holds gifts and offers (daily gift, offers, a free turn on the wheel each day, coins, the starter bundle, the free advert, card packs, the star vault, advert removal) and the right rail holds games and events (prize wheel, park map, pearl dive, Puddle, tasks, the spin event, statistics, the league, the pay table).

## How the game works

| System | What it does |
| --- | --- |
| Spins | The spin currency. One comes back every two minutes up to a meter of 60 (Puddle raises it). Prizes can push you over. |
| The machine | Three reels of three rows; the middle row pays. Coins and chests pay on every spin. Three of a kind gives a coin win, a chest win, the jackpot (bells), a pearl dive (shells), a turn on the prize wheel (beach balls), free spins (tickets) or cherries for Puddle. Starfish pay nothing. The bet (×1 to ×50) multiplies both the cost and the prize. Hold SPIN to spin automatically. |
| Building | Each park has eight sites: four rides, and the Entrance, Parking, Restrooms and Food Stalls. Each is built up through ten stars, shown as levels 10 to 100, and then one capacity upgrade (more seats, gates, spaces and so on). Every star adds to the gate takings; some pay a bonus of spins or a card pack. Everything at level 100 with its capacity upgrade finishes the park: a gold pack, 25 spins and the next park. |
| Parks | A hundred parks across four painted themes that come round in turn: Coral Cove, Pirate Harbour, Jungle Falls and Snowlight Village. Prices stop climbing after park 15, and no park takes more than about 1,800 spins. |
| Prize wheel | Three beach balls, or the free daily ticket, give a turn on an eight-wedge wheel: coins, spins, cherries or a card pack. |
| Pearl dive | Three shells on the reels: four shells, treasure hidden in three of them, three picks. |
| Cards | 81 cards in nine sets of nine, rated one to five gems, the five-gem card in each set being gold. Packs come from upgrades, finished parks, the wheel, events and coins. A new set opens with each park up to the ninth. Finished sets pay spins; the finished album pays 500 and starts a new season. |
| Star vault | Spare cards become stars, and stars buy cards you are guaranteed not to own, including missing gold cards. A pack is also topped up with a new card after two packs in a row with nothing new. |
| Puddle | The park's duck. Feed him cherries won on the machine to level him up: each level pays spins, raises the spin meter and adds 5% to pearl dives. |
| Club | A two-day spin event with milestone prizes, and a daily league table scored on pearl dives and turns on the wheel. The other clubs in the table are run by the game: real clubs need a server, which this folder does not have. |
| The gate | A built park takes money by the minute, more with every star. It trickles in while you play and for up to three hours while you are away. |
| Tasks and gifts | One task is always active, and there is a gift each day on a seven-day cycle. |
| Offers and adverts | Spin bundles, coin and card bundles and an advert-removal purchase; opt-in adverts for free spins and for doubling the gate takings after time away. See below for how they are connected. |

There are no attacks and no shields: nothing another player does can damage a park.

The game saves to `localStorage` every ten seconds and whenever the tab is hidden. Settings has a save code for moving a game between devices.

## The artwork

Everything painted comes from the Park! mock-up pack and concept paintings, and lives in `img/`:

| Files | What they are |
| --- | --- |
| `slots.webp`, `park-coral.webp`, `park-pirate.webp`, `park-jungle.webp`, `park-winter.webp` | The full-screen paintings behind the Slots and Park pages. On the park paintings the mock-up's own top bar, task chip and tab bar are filled in from the scenery around them, because the live ones are drawn on top. |
| `sym-*.webp`, `ico-ticket.webp`, `spin-dome.webp` | The reel symbols and the SPIN button, cut out of the Slots painting. |
| `cards-<set>.webp` | The nine card paintings of each set, packed three by three on one sheet. |
| `tab-*.webp`, `ico-*.webp`, `logo.webp`, `splash.webp`, `panda-*.webp` | Tab icons, counters, the wordmark, the loading screen and the panda host in four poses. |

They were cut from mock-up images, so they are mock-up resolution (the full-screen paintings are 851 pixels wide, each card 200). Dropping higher-resolution exports in under the same names sharpens the whole game without touching the code.

The positions of the live controls are in the last section of `css/style.css` ("The stage") and, for the eight sites, in `SITES` in `js/parkview.js`. Both are in stage pixels; multiply a position on an 851-wide painting by 390/851 to get them. A new park theme needs one painting in the same layout and one entry in `PARK_THEMES` in `js/config.js`.

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
css/style.css         everything visual; the last sections lay out the stage and the painted cards
img/                  artwork cut from the mock-up pack
js/config.js          all game data and tuning numbers: outcomes, parks, sites, cards, wheel, products
js/economy.js         pure maths: units, costs, bets, the gate
js/rules.js           spins, building, the wheel, pearl dives, cards, the pet, events, league, daily gift
js/sim.js             the gate: takings while playing and while away
js/goals.js           tasks
js/state.js           save state, validation, export codes
js/format.js          number and time formatting
js/parkview.js        the park page: painting, colour spreading from built sites, tags, coins, confetti
js/slotview.js        the reels, drawn as drums with the painted symbols
js/fx.js              the coin shower
js/ui.js              top bar, tab bar, the Slots page and its rails, sheets, mini-games, shop, pop-ups
js/audio.js           sound effects and music
js/main.js            boot, frame loop, saving, time away
tests/                unit tests for the rules
tools/balance.mjs     a bot that plays the real rules to check pacing
```

`config.js`, `economy.js`, `rules.js`, `sim.js`, `goals.js`, `state.js` and `format.js` run without a browser, which is what lets the tests and the balance bot use the real rules. In the code the spin currency is still called `tokens`, a park is a `town` and a site is a `plot`.

## How the numbers hang together

Every payout and price in a park is a multiple of that park's coin "unit" (`economy.unit`), which grows 1.55× per park until park 15 and then stays put. `economy.spinEV()` works out what an average spin returns from the outcome table in `config.js`, and each park's 88 upgrades (eight sites, ten stars and a capacity upgrade each) are priced to add up to a target number of spins (`economy.townSpins`: 90 for the first park, 180 for the second, rising to a ceiling of 1,800). Change the outcome weights or payouts and the prices follow automatically.

```sh
npm test                      # node --test, no install needed (Node 20+)
npm run balance               # a bot plays 7 days at 4 sessions a day
node tools/balance.mjs 14 3   # days, sessions per day
```

With the current numbers, `node tools/balance.mjs 14 3` finishes the first park in about 30 spins (prizes and bigger bets carry it well past the bet-one target), is in its seventh park by the end of day one, its thirteenth after a week and its eighteenth after two, by which time it has 79 of the 81 cards. A test checks that 60,000 simulated spins pay within 6% of what `spinEV()` predicts.

Useful while developing: `?speed=60` runs the clock sixty times faster (spins coming back, events, the league), and `window.park` exposes the live state, rules and park view in the console.

## What is not here

- Clubs, friends, gifting and trading cards between players: these need accounts and a server.
- The other side games in the research notes (merge board, card draw, expeditions) are not built; the prize wheel and the pearl dive are.
- Real adverts and payments: see above.
- It has been tested in desktop Chromium at phone sizes, not on a physical phone.
