// Game data and tuning. Everything that shapes the economy lives here so the
// game, the tests and the balance tool all read the same numbers.

export const GAME_TITLE = 'Park!';
export const VERSION = '9.0.0';
export const SAVE_KEY = 'park.save.v4';
// a save written under an earlier key is picked up once and carried over
export const LEGACY_SAVE_KEYS = ['park.save.v3'];
export const CURRENCY = '£';

// Every park has the same eight things to build: four rides, then the
// entrance, the car park, the restrooms and the food stalls.
export const PLOTS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ index: k, kind: k < 4 ? 'ride' : 'facility' }));

// Two things to buy at every site. The price track has ten stars, one every
// ten levels (so level 100 at the top). The capacity track (seats, gates,
// spaces, toilets, stalls) has five steps; step n opens at level 20 x n.
export const STAGES = 10;
export const LEVELS_PER_STAGE = 10;
export const CAP_STEPS = 5;

export const TUNING = {
  // spins
  startTokens: 60,
  tokenCap: 60,
  tokenEvery: 120, // seconds per regenerated spin
  bets: [1, 2, 3, 5, 10, 20, 50],
  betNeedsTokens: 12, // a bet of N is offered once you hold N x this many spins
  // coins
  unitBase: 1000,
  unitGrowth: 1.55,
  slotWeights: [1.0, 1.25, 1.5, 1.8, 0.7, 0.8, 0.6, 0.75],
  stageWeights: [1, 1.2, 1.45, 1.7, 2, 2.3, 2.7, 3.1, 3.6, 4.2], // the ten stars
  capWeights: [1.1, 1.5, 2, 2.6, 3.3], // the five capacity steps
  capBoost: 0.12, // each capacity step adds this share to what a site takes
  gateRate: 0.00022, // coins a second, per star, as a share of the park's unit
  legacyShare: 0.06, // a finished park keeps earning this share of its full takings
  unitCapPark: 14, // prices stop climbing after this park
  spinsCap: 1800, // and no park takes more spins than this
  offlineCapHours: 3,
  offlineMinSeconds: 60,
  dayLength: 300,
  // events
  eventHours: 48,
  leagueHours: 24,
};

// ---- the player's level ------------------------------------------------------
// Every star bought in any park counts. Levels pace when things open up.

export const levelStars = (level) => 4 * (level - 1) * level; // stars needed to reach a level
export function levelOf(stars) {
  let level = 1;
  while (levelStars(level + 1) <= stars) level++;
  return level;
}
export const levelReward = (level) => ({ tokens: Math.min(5 + Math.floor(level / 2), 25), coins: 10 + level * 2, ...(level % 5 === 0 ? { pack: 'gold' } : {}) });

// What opens at each level. `id` is what the rest of the game asks about.
export const UNLOCKS = [
  { level: 2, id: 'cards', name: 'Cards', blurb: 'Open packs and fill the album.' },
  { level: 3, id: 'missions', name: 'Missions', blurb: 'Fresh jobs every day, with a chest at the end.' },
  { level: 4, id: 'draw', name: 'Prize Draw', blurb: 'Burst prize bubbles round the giant clam.' },
  { level: 5, id: 'pets', name: 'Pet shop', blurb: 'More pals, each with a talent of their own.' },
  { level: 6, id: 'merge', name: 'Rockpool Merge', blurb: 'Match shells to make rarer ones.' },
  { level: 7, id: 'club', name: 'Park Pals', blurb: 'Swap spins and cards, and build together.' },
  { level: 8, id: 'trail', name: 'Expedition', blurb: 'Grow swords, clear the trail, fire the cannon.' },
  { level: 9, id: 'chests', name: 'Lucky Chests', blurb: 'Six chests, six prizes, one key each.' },
  { level: 10, id: 'pass', name: 'Park Pass', blurb: 'A season of prizes for playing.' },
  { level: 10, id: 'festival', name: 'Festival', blurb: 'Earn gems in every game and dress the pier.' },
];
export const unlockLevel = (id) => (UNLOCKS.find((u) => u.id === id) || { level: 1 }).level;

// ---- things you can hold -------------------------------------------------------
// Beyond coins, spins, cherries and card packs. `icon` is a picture in img/.

export const ITEMS = {
  energy: { name: 'energy', one: 'energy', icon: 'ico-energy' },
  pearls: { name: 'pearl tokens', one: 'pearl token', icon: 'ico-pearl' },
  swords: { name: 'swords', one: 'sword', icon: 'ico-sword' },
  food: { name: 'plant food', one: 'plant food', icon: 'ico-food' },
  shots: { name: 'cannonballs', one: 'cannonball', icon: 'ico-cannonball' },
  keys: { name: 'keys', one: 'key', icon: 'ico-key' },
  gems: { name: 'gems', one: 'gem', icon: 'ico-gem' },
};
export const START_ITEMS = { energy: 30, pearls: 3, swords: 0, food: 20, shots: 6, keys: 2, gems: 0 };

// ---- the machine ---------------------------------------------------------------
// The reels are the park. Eight of the symbols are the park's own eight sites,
// cut from its painting: a site you have built pays every time it stops on the
// line, and the more you have built there the more it pays. A site you have
// not built yet shows as closed and pays nothing. Three of the same site is
// its rush hour.
export const SITE_SYMBOLS = PLOTS.map((p) => 's' + p.index);
export const siteOf = (sym) => (typeof sym === 'string' && sym.length === 2 && sym[0] === 's' ? Number(sym[1]) : -1);

// What one spin can land on. Weights are per cent of spins. A rush hour picks
// one of the eight sites; if that one is not built the spin is a mixed one.
export const OUTCOMES = [
  { kind: 'rush', w: 6.0 },
  { kind: 'coins3', w: 5.0 },
  { kind: 'jackpot', w: 1.5 },
  { kind: 'bell', w: 5.0 },
  { kind: 'wheel', w: 5.0 },
  { kind: 'tokens', w: 3.5 },
  { kind: 'treats', w: 4.0 },
  { kind: 'mixed', w: 70.0 },
];

// Three bells start Ring the Bell, three balls win a turn on the prize wheel,
// three chests are the jackpot. Nobody attacks anybody.
export const SYMBOLS = ['coin', 'sack', ...SITE_SYMBOLS, 'token', 'star', 'chips', 'ball', 'fish'];
// The picture for each of the other symbols (in img/). 'fish' is the starfish:
// it fills out the reels and pays nothing.
export const SYMBOL_ART = { coin: 'sym-coin', sack: 'sym-chest', token: 'ico-ticket', star: 'sym-bell', chips: 'sym-cherry', ball: 'sym-ball', fish: 'sym-star' };
export const TRIPLE = { coins3: 'coin', jackpot: 'sack', bell: 'star', wheel: 'ball', tokens: 'token', treats: 'chips' };
export const MIXED_WEIGHTS = {
  coin: 16, sack: 5, ...Object.fromEntries(SITE_SYMBOLS.map((s) => [s, 6])), token: 7, ball: 7, chips: 6, star: 5, fish: 6,
};

// Payouts in "units" (see economy.unit), before the bet multiplier.
export const PAY = {
  coin: 1,
  sack: 3,
  coins3: 10,
  jackpot: 50,
  site: 2, // a finished, middle-sized site pays this for each symbol on the line
  siteOpen: 0.3, // a site pays this share of its full rate from its first star
  tokens: 6,
  treats: 3,
};
// Three of the same site: it pays this many symbols at once, and then that
// site pays double for the next few spins.
export const RUSH = { mult: 10, hotSpins: 5, hotMult: 2 };
// Ring the Bell: three swings of the mallet at a prize that grows with the
// park. A swing pays its share by how high the puck goes, in full if the bell
// rings; three rings out of three adds a bonus.
export const BELL = {
  base: 16, // units in the prize with nothing built
  perPark: 2, // and this much more for each full site's worth of park
  shares: [0.3, 0.3, 0.4],
  ringAt: 0.85, // how hard a swing has to be (0 to 1) to reach the bell
  low: 0.3, // what the weakest swing pays, as a share
  slope: 0.6, // and how much each bit of power adds
  peal: 0.15, // bonus share of the prize for three rings
  typical: 0.8, // what an ordinary player takes home, for the sums
};

// The first spins of a new game follow a script so every mechanic turns up early.
export const OPENING_SPINS = ['coins3', 'mixed', 'coins3', 'rush', 'mixed', 'wheel', 'mixed', 'bell', 'treats', 'mixed', 'tokens'];

// A little of everything else comes off the reels too: each symbol on the pay
// line has a small chance of dropping something for the side games.
export const REEL_DROPS = [
  { item: 'energy', sym: 'fish', chance: 0.5, n: 1, needs: 'merge' },
  { item: 'pearls', sym: 'sack', chance: 0.25, n: 1, needs: 'draw' },
  { item: 'shots', sym: 'ball', chance: 0.2, n: 1, needs: 'trail' },
  { item: 'keys', sym: 'star', chance: 0.15, n: 1, needs: 'chests' },
];

// ---- parks -------------------------------------------------------------------
// Each theme is one painted backdrop with the same layout, so the same eight
// sites sit in the same places; the rides change their names.
export const PARKS_TOTAL = 100;
export const PARK_THEMES = [
  { key: 'coral', name: 'Coral Cove', tag: 'Shells, pearls and warm shallows', rides: ['Jellyfish Swing', 'Pearl Spinner', 'Reef Runner', 'Tide Wheel'] },
  { key: 'pirate', name: 'Pirate Harbour', tag: 'Sails, maps and buried treasure', rides: ['Crow’s Nest Swing', 'Compass Spinner', 'Plank Runner', 'Harbour Wheel'] },
  { key: 'jungle', name: 'Jungle Falls', tag: 'Vines, lotus pools and warm rain', rides: ['Canopy Swing', 'Lotus Spinner', 'Vine Runner', 'Falls Wheel'] },
  { key: 'winter', name: 'Snowlight Village', tag: 'Lanterns, pines and fresh snow', rides: ['Frost Swing', 'Snowflake Spinner', 'Sleigh Runner', 'Aurora Wheel'] },
];
const RIDE_BLURBS = ['Round and round over the water.', 'The showpiece in the middle of the park.', 'Fast, loud and over too soon.', 'The whole park laid out below you.'];
export const FACILITIES = [
  { id: 'entrance', name: 'Entrance', blurb: 'More gates, shorter queues.', cap: 'Gates', capBase: 2 },
  { id: 'parking', name: 'Parking', blurb: 'Somewhere for everyone to leave the car.', cap: 'Parking spaces', capBase: 20 },
  { id: 'restrooms', name: 'Restrooms', blurb: 'Nobody enjoys a park without them.', cap: 'Toilets', capBase: 2 },
  { id: 'food', name: 'Food Stalls', blurb: 'Hot chips, cold drinks, sticky fingers.', cap: 'Stalls', capBase: 1 },
];
const RIDE_SEATS = [8, 12, 12, 16];
// What stands on site k in park t. `capBase` is how many seats (or gates, and
// so on) it starts with; each capacity step adds half as many again.
export function buildingAt(t, k) {
  const theme = PARK_THEMES[t % PARK_THEMES.length];
  if (k < 4) return { index: k, id: 'ride' + k, name: theme.rides[k], kind: 'ride', blurb: RIDE_BLURBS[k], cap: 'Seats', capBase: RIDE_SEATS[k] };
  return { index: k, kind: 'facility', ...FACILITIES[k - 4] };
}
export const capCount = (building, cap) => Math.round(building.capBase * (1 + cap / 2));

// Parks go on past the hundredth: looks cycle, prices are capped.
export function townInfo(t) {
  const theme = PARK_THEMES[t % PARK_THEMES.length];
  const lap = Math.floor(t / PARK_THEMES.length);
  return { index: t, number: t + 1, name: lap ? `${theme.name} ${lap + 1}` : theme.name, tag: theme.tag, theme, lineup: [0, 1, 2, 3, 4, 5, 6, 7] };
}

// Four chests along each park's progress bar, at a quarter, a half, three
// quarters and all of its stars.
export const PARK_CHESTS = [
  { tokens: 3, coins: 20 },
  { tokens: 5, coins: 40, energy: 6 },
  { tokens: 6, coins: 70, pack: 'bronze' },
  { tokens: 10, coins: 120, pearls: 1 },
];
export const UPGRADE_REWARDS = { 5: { tokens: 2 }, 10: { pack: 'bronze' } };
export const TOWN_REWARD = { tokens: 25, pack: 'gold' };

// The prize wheel: eight wedges, weighted.
export const WHEEL = [
  { reward: { coins: 15 }, w: 22 }, { reward: { tokens: 3 }, w: 18 }, { reward: { coins: 40 }, w: 16 }, { reward: { treats: 4 }, w: 14 },
  { reward: { tokens: 8 }, w: 10 }, { reward: { pack: 'bronze' }, w: 10 }, { reward: { coins: 120 }, w: 6 }, { reward: { pack: 'silver' }, w: 4 },
];

// ---- other players -------------------------------------------------------------
// There is no server yet, so the league table, the club and the team event
// are filled with computer-run players. `face` is a cell on img/avatars.webp.

export const RIVALS = [
  { name: 'Dotty', park: "Dotty's Dunes", face: 3 },
  { name: 'Big Reg', park: 'Pickles Pier', face: 6 },
  { name: 'Zelda', park: "Finch's Lagoon", face: 7 },
  { name: 'Quill', park: 'Quill Quay', face: 8 },
  { name: 'Nan', park: 'Bramble Bay', face: 10 },
  { name: 'Flash', park: 'Flashbang Falls', face: 13 },
  { name: 'Mabel', park: 'Sprocket Sands', face: 11 },
  { name: 'Tiddler', park: 'Tiddler Towers', face: 9 },
  { name: 'Humbug', park: 'Humbug Harbour', face: 4 },
];

// ---- shop and adverts ---------------------------------------------------------

// Until a real payment and advert provider is connected (see the README), the
// shop runs in preview mode: adverts are a short stand-in and purchases are
// granted without any payment. Turn this off to show "coming soon" instead.
export const STORE_PREVIEW = true;

// Display prices are placeholders; a real store supplies localised ones.
// Coins are in units, so a pack is worth the same number of spins in any park.
export const PRODUCTS = [
  { id: 'spins_1', group: 'spins', name: '60 spins', price: '£1.99', grant: { tokens: 60 }, art: 'ico-tickets' },
  { id: 'spins_2', group: 'spins', name: '160 spins', price: '£4.99', grant: { tokens: 160 }, art: 'ico-tickets', bonus: '7% more' },
  { id: 'spins_3', group: 'spins', name: '330 spins', price: '£9.99', grant: { tokens: 330 }, art: 'ico-spinpack', bonus: '10% more' },
  { id: 'spins_4', group: 'spins', name: '720 spins', price: '£19.99', grant: { tokens: 720 }, art: 'ico-spinpack', bonus: '20% more', tag: 'Popular' },
  { id: 'spins_5', group: 'spins', name: '2,100 spins', price: '£49.99', grant: { tokens: 2100 }, art: 'ico-spinpack', bonus: '40% more' },
  { id: 'spins_6', group: 'spins', name: '6,000 spins', price: '£99.99', grant: { tokens: 6000 }, art: 'ico-spinpack', bonus: '100% more', tag: 'Best value' },
  { id: 'coins_1', group: 'coins', name: 'Handful', price: '£1.99', grant: { coins: 150 }, art: 'ico-coins' },
  { id: 'coins_2', group: 'coins', name: 'Purse', price: '£4.99', grant: { coins: 420 }, art: 'prize-04', bonus: '10% more' },
  { id: 'coins_3', group: 'coins', name: 'Stack', price: '£9.99', grant: { coins: 900 }, art: 'prize-05', bonus: '20% more' },
  { id: 'coins_4', group: 'coins', name: 'Chest', price: '£19.99', grant: { coins: 2000 }, art: 'ico-coins-big', bonus: '35% more', tag: 'Popular' },
  { id: 'coins_5', group: 'coins', name: 'Safe', price: '£49.99', grant: { coins: 5600 }, art: 'prize-06', bonus: '60% more' },
  { id: 'coins_6', group: 'coins', name: 'Treasure', price: '£99.99', grant: { coins: 14000 }, art: 'ico-chest-open', bonus: '100% more', tag: 'Best value' },
  { id: 'daily', group: 'bundle', name: 'Daily bundle', price: '£4.99', grant: { tokens: 150, coins: 300, energy: 50 }, daily: true, tag: '4x value' },
  { id: 'starter', group: 'bundle', name: 'Starter bundle', price: '£1.99', grant: { tokens: 120, coins: 150, packs: { gold: 1 } }, once: true, tag: 'One time only' },
  { id: 'goldpacks', group: 'bundle', name: 'Three gold packs', price: '£3.99', grant: { packs: { gold: 3 } } },
  { id: 'games', group: 'bundle', name: 'Games bundle', price: '£3.99', grant: { energy: 100, pearls: 10, shots: 12, keys: 6 } },
  { id: 'pass', group: 'extra', name: 'Park Pass', price: '£4.99', pass: true, desc: 'Opens the premium prizes for this season of the Park Pass.' },
  {
    id: 'noads', group: 'extra', name: 'No interruptions', price: '£3.99', once: true, noAds: true,
    desc: 'Removes the adverts between parks. Adverts you choose to watch for a reward stay.',
  },
];

// Adverts are always the player's choice, and always for something. Each
// placement has its own daily allowance.
export const ADS = {
  tokens: { reward: { tokens: 25 }, perDay: 6, name: 'Free spins' },
  energy: { reward: { energy: 20 }, perDay: 4, name: 'Merge energy', needs: 'merge' },
  pearls: { reward: { pearls: 2 }, perDay: 3, name: 'Pearl tokens', needs: 'draw' },
  shots: { reward: { shots: 5 }, perDay: 3, name: 'Cannonballs', needs: 'trail' },
  keys: { reward: { keys: 2 }, perDay: 3, name: 'Keys', needs: 'chests' },
  wheel: { reward: { wheel: 1 }, perDay: 2, name: 'A turn on the wheel' },
  boost: { boost: 30, perDay: 3, name: 'Double takings for 30 minutes' },
};

// ---- cards ------------------------------------------------------------------

// Nine cards a set: rarity is the star count; the five-star card is the gold one.
// The pictures are the painted cards from the album mock-ups, packed nine to a
// sheet (img/cards-<set>.webp); each card names its cell on the sheet, counted
// along the rows from the top left.
const RARITY = [1, 1, 2, 2, 3, 3, 4, 4, 5];
const SET = (id, name, color, reward, cards) => ({ id, name, color, reward, sheet: 'cards-' + id, cards });

export const CARD_SETS = [
  SET('pond', 'Pond Life', '#2aa6c9', 20, [
    [8, 'Peeping Frog'], [5, 'Sunset Fish'], [6, 'Busy Beaver'], [3, 'Darting Dragonfly'],
    [4, 'Paddling Turtle'], [0, 'Lilypad Leaper'], [2, 'Patient Heron'], [1, 'Floating Otter'], [7, 'Bath-time Duck'],
  ]),
  SET('desert', 'Desert Days', '#e9a23b', 25, [
    [5, 'Flowering Cactus'], [2, 'Sunning Gecko'], [8, 'Thorny Lizard'], [6, 'Coiled Snake'],
    [3, 'Sand Chick'], [7, 'Desert Tortoise'], [1, 'Little Camel'], [0, 'Fennec Pup'], [4, 'Big-eared Fox'],
  ]),
  SET('hatch', 'Hatch Day', '#7c6ee6', 30, [
    [8, 'Full Nest'], [1, 'Green Peeper'], [0, 'First Roar'], [7, 'Blue Splash'],
    [5, 'Purple Stretch'], [3, 'Bluebird Baby'], [4, 'Tiny Tricorn'], [6, 'Violet Horns'], [2, 'Pink Flutter'],
  ]),
  SET('tropic', 'Tropical Crew', '#2fae5a', 35, [
    [0, 'Tree Frog'], [7, 'Emerald Snake'], [8, 'Blue Dart Frog'], [6, 'Cheeky Monkey'],
    [2, 'Sleepy Sloth'], [5, 'Toucan'], [1, 'Scarlet Macaw'], [3, 'Blue Morpho'], [4, 'Jaguar Cub'],
  ]),
  SET('garden', 'Garden Party', '#ec6aa0', 40, [
    [8, 'Ladybird Hat'], [2, 'Lotus Frog'], [1, 'Tortoise in Bloom'], [3, 'Bluebird Bonnet'],
    [4, 'Sunday Squirrel'], [6, 'Sunflower Hedgehog'], [5, 'Dapper Fox'], [7, 'Daisy Butterfly'], [0, 'Bonnet Bunny'],
  ]),
  SET('leafy', 'Leafy Lane', '#5fb236', 50, [
    [6, 'Little Sprout'], [5, 'Happy Frog'], [8, 'Bumblebee'], [0, 'Leaf Turtle'],
    [4, 'Curly Chameleon'], [2, 'Blossom Frog'], [7, 'Calling Toucan'], [1, 'Swinging Sloth'], [3, 'Garden Sprite'],
  ]),
  SET('grotto', 'Glitter Grotto', '#6a5be0', 60, [
    [6, 'Grotto Crab'], [3, 'Pink Bat'], [4, 'Sparkle Hedgehog'], [0, 'Jewel Turtle'],
    [5, 'Glass Serpent'], [7, 'Lantern Owl'], [1, 'Frosty Fox'], [8, 'Grotto Giant'], [2, 'Crystal Deer'],
  ]),
  SET('ember', 'Little Embers', '#f0642c', 70, [
    [3, 'Lava Egg'], [1, 'Flame Sprite'], [5, 'Spark Cub'], [7, 'Horned Cub'],
    [2, 'Blaze Pup'], [8, 'Magma Tortoise'], [0, 'Ember Dragon'], [4, 'Sun Dragon'], [6, 'Phoenix Chick'],
  ]),
  SET('lava', 'Lava Lodge', '#d8432c', 90, [
    [1, 'Steam Puff'], [6, 'Spotted Gecko'], [2, 'Boulder Tortoise'], [0, 'Lava Paddler'],
    [3, 'Crystal-back Lizard'], [7, 'Stone Rhino'], [4, 'Flame Parrot'], [5, 'Cinder Fox'], [8, 'Mountain Keeper'],
  ]),
];

export const CARDS = [];
CARD_SETS.forEach((set, s) => {
  set.index = s;
  set.cards = set.cards.map(([cell, name], k) => {
    const card = { id: `${set.id}-${k}`, set: s, slot: k, sheet: set.sheet, cell, name, stars: RARITY[k], gold: RARITY[k] === 5 };
    CARDS.push(card);
    return card;
  });
});
export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// A set starts turning up in packs once you reach this town.
export const setUnlockTown = (s) => s;

export const PACKS = {
  bronze: { name: 'Bronze pack', size: 2, odds: [55, 30, 13, 2, 0], price: 12 },
  silver: { name: 'Silver pack', size: 3, odds: [30, 35, 25, 10, 0], price: 30 },
  gold: { name: 'Gold pack', size: 4, odds: [0, 30, 36, 24, 10], price: 90 },
};

// Spare cards turn into stars; stars buy things you are guaranteed not to have.
export const VAULT = [
  { id: 'small', cost: 30, name: 'Silver pack', pack: 'silver', fresh: 0, gold: false },
  { id: 'big', cost: 80, name: 'Gold pack + a new card', pack: 'gold', fresh: 1, gold: false },
  { id: 'grand', cost: 200, name: 'A gold card you are missing', pack: null, fresh: 0, gold: true },
];
export const ALBUM_REWARD = { tokens: 250 };
// Finish a set and its creatures move into the park for good: they live at one
// site, in every park, and that site pays more. Finishing the set again in a
// later season adds to it, up to `max` times.
export const HOMES = { boost: 0.1, max: 3 };
export const homeSite = (s) => s % PLOTS.length;

// ---- events -----------------------------------------------------------------

export const EVENT_THEMES = [
  { name: 'High Tide', blurb: 'Every spin brings the tide a little higher.' },
  { name: 'Ticket Frenzy', blurb: 'Tear through the roll, one spin at a time.' },
  { name: 'Shell Hunt', blurb: 'Comb the beach from the pier to the rocks.' },
  { name: 'Sunset Splash', blurb: 'Keep the park busy until the lights come on.' },
];
export const EVENT_POINTS = { spin: 1, triple: 3, rush: 6, bell: 12, jackpot: 25 };
// reward: tokens, coins (in units), treats or a pack
export const EVENT_MILESTONES = [
  { at: 15, reward: { tokens: 10 } },
  { at: 40, reward: { coins: 15 } },
  { at: 80, reward: { pack: 'bronze' } },
  { at: 140, reward: { tokens: 20 } },
  { at: 220, reward: { treats: 6 } },
  { at: 320, reward: { pack: 'silver' } },
  { at: 450, reward: { tokens: 40 } },
  { at: 620, reward: { coins: 60 } },
  { at: 850, reward: { pack: 'gold' } },
  { at: 1150, reward: { tokens: 80 } },
  { at: 1500, reward: { treats: 20 } },
  { at: 2000, reward: { tokens: 200, pack: 'gold' } },
];

export const LEAGUE_POINTS = { swing: 2, ring: 4, peal: 6, wheel: 8 };
export const LEAGUE_PRIZES = [
  { upTo: 1, reward: { tokens: 100, pack: 'gold' } },
  { upTo: 3, reward: { tokens: 50, pack: 'silver' } },
  { upTo: 5, reward: { tokens: 25 } },
  { upTo: 10, reward: { tokens: 10 } },
];

export const DAILY = [
  { tokens: 15 },
  { coins: 20 },
  { tokens: 25 },
  { pack: 'bronze' },
  { tokens: 40 },
  { pack: 'silver' },
  { tokens: 100, pack: 'gold' },
];

export const GUEST_LOOKS = {
  shirts: ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#f5f5f5', '#30a46c', '#0090ff', '#ad7f58'],
  skins: ['#f6d2b8', '#eab894', '#c98e62', '#a06a42', '#7a4a2c', '#f9dcc4'],
  hairs: ['#2b2118', '#5a3b22', '#8a5a2b', '#d9a441', '#b03a2e', '#cfcfcf', '#161616'],
  trousers: ['#2f3a5c', '#3d3d3d', '#5b4a3a', '#274060', '#4a2f4f'],
};
