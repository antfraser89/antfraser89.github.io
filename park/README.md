# Park!

A spin-and-build theme park game for phones, played in the browser. Spin a lucky machine for coins, spend them on the rides and facilities of a painted park, and finish it to open the next of a hundred. Round that sit a prize wheel, a pearl dive, a merge game, a prize draw, an expedition, lucky chests, pets, cards, missions, a season pass, a weekly festival and a club.

It is built in the "spin and build" genre of mobile games such as Carnival Tycoon, and its structure follows the research notes and mock-up pack kept in the `park-game` repository. The name, mascot, parks, cards, events and artwork are Park!'s own.

Play it at `https://antfraser89.github.io/park/` once this folder is on the default branch. It installs to a phone's home screen from there and then plays without a connection.

No build step and nothing to install. The audio is synthesised with Web Audio, and the only thing fetched from elsewhere is the type (Lilita One and Baloo 2, from Google Fonts). The folder is self-contained, so it can be moved to its own repository as-is.

## Run it locally

ES modules need to be served over HTTP, so open it through any static server:

```sh
cd park
python3 -m http.server 8080   # or: npm run serve
# then visit http://localhost:8080
```

## How the screen is built

The game is laid out on a fixed stage of 390 × 847, the shape of the mock-up paintings, and the whole stage is scaled to fit the window. On a phone it fills the screen (keeping clear of the home indicator where there is one); on a wider window it sits in the middle over a soft-focus backdrop.

Most full screens are a mock-up painting used as the backdrop, with every live control placed in stage pixels exactly over its painted counterpart: numbers that change are covered by a live label in the same colours, and painted buttons get an invisible button on top.

| Screen | Backdrop | What is live on top |
| --- | --- | --- |
| Slots | `slots.webp` | The reels (a canvas, with the painted symbols), the Park Bonus track, the bet, the spin meter, SPIN, the advert button and the two rails of shortcuts. |
| Park | `park-<theme>.webp` | The eight sites as tap targets with their level tags, the park name and progress bar, the chest at its end, the map and stats buttons, coins, confetti and fireworks. The park starts grey; colour spreads from each site as it is built. |
| Prize Draw | `bg-draw.webp` | The number on every bubble, the round bar, the token count, both draw buttons. |
| Expedition | `bg-trail.webp`, `bg-plant.webp`, `bg-cannon.webp` | Flags on the trail, the sword and stage counters, the garden's bars, every jar on the cannon board. |
| Lucky Chests | `bg-chests.webp` | The six prize numbers, the six chests, keys, level and progress. |
| Team build | `bg-team.webp` | Each project's bar, the team total, the timer, your rank and points. |
| The flight between parks | `bg-load.webp` | The destination and the bar. |

Everything else (cards, offers, missions, the pass, the festival, the club, pets, settings) is a sheet built in the page, with pictures cut from the mock-ups.

A tab bar runs along the bottom: **Offers**, **Park**, **Slots**, **Cards** and **Club**. Your level, coins, spins and the current task stay on screen on those pages. On the Slots page the left rail holds gifts and offers and the right rail holds games and events, as in the mock-ups. The phone's back button closes whatever is open.

## How the game works

| System | What it does |
| --- | --- |
| Spins | The spin currency. One comes back every two minutes up to a meter of 60 (pets raise it). Prizes can push you over. |
| The machine | Three reels of three rows; the middle row pays. Coins and chests pay on every spin. Three of a kind gives a coin win, a chest win, the jackpot (bells), a pearl dive (shells), a turn on the prize wheel (beach balls), free spins (tickets) or cherries for your pet. Starfish pay nothing. The bet (×1 to ×50) multiplies both the cost and the prize. Hold SPIN to spin automatically. Once the side games are open, symbols on the pay line sometimes drop energy, pearl tokens, cannonballs and keys. |
| Building | Each park has eight sites: four rides, and the Entrance, Parking, Restrooms and Food Stalls. Every site has two things to buy: its level (ten stars, levels 10 to 100) and its capacity (five steps of seats, gates, spaces, toilets or stalls; step *n* opens at level 20 × *n*). Both add to the gate takings. 120 purchases finish a park. |
| Parks | A hundred parks across four painted themes that come round in turn: Coral Cove, Pirate Harbour, Jungle Falls and Snowlight Village. Prices stop climbing after park 15. A finished park stays on the map, can be visited, and goes on earning a share of its takings for good. Each park has four chests along its progress bar. |
| Your level | Every star bought in any park counts. Each level pays a prize, and levels 2 to 10 each open something: cards, missions, the Prize Draw, the pet shop, Rockpool Merge, Park Pals, the Expedition, Lucky Chests, then the Park Pass and the festival. |
| Prize wheel | Three beach balls, or the free daily ticket, give a turn on an eight-wedge wheel. |
| Pearl dive | Three shells on the reels: four shells, treasure in three of them, three picks. |
| Rockpool Merge | A seven by seven board. The basket drops a shell for a point of energy; two the same make the next along a chain. Some shells start buried and can only be merged into. The first of each new shell pays a prize; the last shell in the chain finishes the round. |
| Prize Draw | A pearl token bursts one bubble. Three of the bubbles are big prizes with a limited stock, and one is guaranteed at least every sixteen draws. Eighty draws in a round wins the pearl. |
| Expedition | Three screens that feed each other. The Sword Garden grows swords over time (plant food makes it grow faster). The trail spends swords to clear six flags a stage, the last a chest. The cannon fires at twenty jars holding swords and plant food; one hides the target that finishes the level. |
| Lucky Chests | Six prizes on show, six chests, one key each: every chest holds one of the prizes. Three boards make a level, and each level's prizes are better. |
| Pets | One pet level, raised with cherries, shared by ten pals. Only the pal walking with you uses its talent (bigger pearl dives, more at the gate, longer away time and so on). Some pals are bought with coins; two arrive when the pet level reaches them. |
| Cards | 81 cards in nine sets of nine, rated one to five gems, the five-gem card in each set being gold. Finished sets pay out; the finished album pays more and starts a new season. Spare cards become stars for the vault, which sells cards you are guaranteed not to own. The odds of every pack are shown in the game. |
| Missions | Six a day and four a week, each counting something the game already tallies. They pay prizes and mission points, which open a row of chests and count towards the pass. |
| Park Pass | A four-week season of thirty tiers, with a free prize and a premium prize on each. Pass points come from missions and the daily bonus. |
| Festival | A week-long theme. Gems are prizes all over the game; they buy sixteen decorations (four items, four sizes), with a prize every fourth. Spare gems can be traded in. |
| Park Bonus | A two-day spin event: every spin scores points towards twelve prizes. |
| Club | Park Pals: answer pals' requests for spins and spare cards, ask for spins and for a card yourself, and build five projects together over three days. There is also a daily league table. **The other members are run by the game**: real clubs need accounts and a server, which this folder does not have. The game says so on the club page. |
| The gate | A built park takes money by the minute. It trickles in while you play and for a few hours while you are away. |
| Offers and adverts | Spin packs, coin packs, bundles, the pass and advert removal, all on the Offers page, with a stamp card that pays out every third purchase. Rewarded adverts are always the player's choice and each kind has a daily allowance. When the spins run out there is one note about it per session and no more. |

There are no attacks and no shields: nothing another player does can damage a park.

The game saves to `localStorage` every ten seconds and whenever the tab is hidden. Settings has a save code for moving a game between devices, and "Erase my data".

## The artwork

Everything painted comes from the Park! mock-up pack and concept paintings, and lives in `img/`:

| Files | What they are |
| --- | --- |
| `slots.webp`, `park-*.webp`, `bg-*.webp` | Full-screen paintings used as backdrops. On the park paintings the mock-up's own top bar, task chip and tab bar are filled in from the scenery, and on the cannon painting three jars are painted back in, because the live versions are drawn on top. |
| `sym-*.webp`, `ico-*.webp`, `spin-dome.webp` | Reel symbols, counters and prize icons, cut out with transparent backgrounds. |
| `cards-<set>.webp`, `pets.webp`, `avatars.webp` | Sheets: nine card paintings to a set, nine pets, sixteen faces. |
| `merge-NN.webp`, `decor-*.webp` | The merge chain and the festival decorations. |
| `hdr-*.webp`, `tab-*.webp`, `logo.webp`, `splash.webp`, `panda-*.webp` | Header pictures, tab icons, the wordmark, the loading screen and the panda host. |

They were cut from mock-up images, so they are mock-up resolution (the full-screen paintings are 851 pixels wide). Dropping higher-resolution exports in under the same names sharpens the whole game without touching the code.

Positions are in stage pixels: multiply a position on an 851-wide painting by 390/851. The slots and park positions are in the last section of `css/style.css` and in `SITES` in `js/parkview.js`; each painted side game keeps its positions at the top of its file in `js/screens/`, with matching styles in `css/screens.css`.

## Adverts and purchases

The game has the screens and the rules for both, and one seam where a real provider plugs in. Nothing in this folder takes money or shows a real advert.

Set `window.ParkBridge` before the game starts (a native wrapper such as Capacitor or an Expo WebView would inject it, or a web payment and advert integration can define it):

```js
window.ParkBridge = {
  // resolve true only if the advert was watched to the end; the placement is one of
  // 'tokens', 'energy', 'pearls', 'shots', 'keys', 'wheel', 'boost' or 'away'
  showRewarded: async (placement) => true,
  showInterstitial: async (placement) => {},   // 'travel'; skipped once "No interruptions" is owned
  purchase: async (productId) => true,         // resolve true only after payment has succeeded
  prices: { spins_1: '$1.99' },                // optional localised price labels by product id
};
```

Products and their placeholder prices are in `PRODUCTS` in `js/config.js`, and the advert placements with their daily allowances are in `ADS`. What a purchase hands over is applied by `rules.applyPurchase` once `purchase` resolves true; an advert's prize by `rules.claimAd` once `showRewarded` resolves true, so a failed or abandoned advert costs the player nothing. Purchases are recorded in the local save only, so a real integration should also verify receipts and restore purchases on its side.

With no bridge present, `STORE_PREVIEW` in `js/config.js` decides what players see. While it is `true` (as now) adverts are a short stand-in and purchases are granted free with a clear "preview" notice, so every flow can be tried. Set it to `false` before going public without a provider: the shop then says it opens soon and advert buttons are disabled.

## Before a public release

- **Connect a provider or switch the preview off.** As shipped, every purchase is free (see above).
- **Read `privacy.html` and `terms.html`.** They describe this build accurately (nothing leaves the device), but they name no publisher and no contact address, and they must be updated before any advert network, analytics or payment provider is added.
- **Age rating.** The game pairs a slot-style machine and random card packs with paid spins. App stores ask about simulated gambling and random paid items in their rating questionnaires, and some countries have their own rules. Pack odds are already shown in the game.
- **Test on real phones.** It has been tested in desktop Chromium at phone sizes, by script and by eye. It has not been run on a physical iPhone or Android phone.
- **Clubs are computer-run.** If that is not what you want to ship, the club needs a server.

## Code map

```
index.html            page shell
sw.js                 service worker: offline play
privacy.html, terms.html
css/style.css         the shell, the Slots and Park pages, sheets and pop-ups
css/screens.css       everything in js/screens/
img/                  artwork cut from the mock-up pack
js/config.js          game data and tuning: outcomes, parks, sites, levels, unlocks, cards, wheel, products, adverts
js/core.js            shared helpers: handing over rewards, weighted picks, the calendar
js/economy.js         pure maths: units, costs, bets, the gate, levels
js/rules.js           spins, building, the wheel, pearl dives, cards, events, league, shop, adverts
js/pets.js            pets and their talents
js/games/             merge.js, draw.js, trail.js, chests.js: the side games' rules
js/meta/              missions.js, pass.js, festival.js, club.js
js/game.js            the clock for all of the above, and the badge counts
js/sim.js             the gate: takings while playing and while away
js/goals.js           the task chip
js/state.js           save state, validation, export codes
js/format.js          number and time formatting
js/parkview.js        the park page
js/slotview.js        the reels
js/ui.js              the shell: top bar, tab bar, the Slots page and its rails, sheets, scenes, pop-ups, and the kit
js/screens/           one file per screen or group of screens, each handed the shell's kit
js/preload.js         first pictures, with progress for the loading bar
js/fx.js, js/audio.js the coin shower; sound effects and music
js/main.js            boot, frame loop, saving, time away, the back button, the service worker
tests/                unit tests for the rules (logic.test.js, games.test.js)
tools/balance.mjs     a bot that plays the real rules to check pacing
```

Everything outside `ui.js`, `screens/`, `parkview.js`, `slotview.js`, `fx.js`, `audio.js`, `preload.js` and `main.js` runs without a browser, which is what lets the tests and the balance bot use the real rules. In the code the spin currency is called `tokens`, a park is a `town` and a site is a `plot`.

A new screen is a file in `js/screens/` that exports `install(kit)` and is listed in `js/screens/index.js`. The kit (built at the end of `createUI` in `ui.js`) carries the element helper, sheets, scenes, pop-ups, prize display, adverts and purchases.

## How the numbers hang together

Every payout and price in a park is a multiple of that park's coin "unit" (`economy.unit`), which grows 1.55× per park until park 15 and then stays put. `economy.spinEV()` works out what an average spin returns from the outcome table in `config.js`, and each park's 120 purchases are priced to add up to a target number of spins (`economy.townSpins`: 90 for the first park, 180 for the second, rising to a ceiling of 1,800). Change the outcome weights or payouts and the prices follow automatically.

```sh
npm test                        # node --test, no install needed (Node 20+)
npm run balance                 # a bot plays 7 days at 4 sessions a day
node tools/balance.mjs 14 3     # days, sessions per day
node tools/balance.mjs 7 3 7 ads  # the same, watching every advert on offer
```

The bot plays everything (it builds, does its missions, plays every side game and helps its club), buys nothing, and at the end prints where its spins came from. With the current numbers, at three sessions a day, it finishes the first park in about 30 spins, is in its eighth park by the end of day one, and its nineteenth after a week; after that each park is the full 1,800 spins. A test checks that 60,000 simulated spins pay within 6% of what `spinEV()` predicts.

Useful while developing: `?speed=60` runs the clock sixty times faster, and `window.park` exposes the live state, rules and screens in the console.

## What is not here

- Real clubs, friends, gifting and trading between players: these need accounts and a server.
- Real adverts and payments: see above.
- A native app. The game installs from the browser as a web app; wrapping it for the app stores (for example with Capacitor) and connecting `ParkBridge` is not done.
- From the mock-up pack: the album pass and album leaderboards, the puzzle board, the museum track, the paid reward wheel and the bundle ladder are not built.
