// Game data and tuning. Everything that shapes the economy lives here so the
// game, the tests and the balance tool all read the same numbers.

export const GAME_TITLE = 'Park!';
export const VERSION = '7.0.0';
export const SAVE_KEY = 'park.save.v3';
// saves written under an earlier name are picked up once and carried over
export const LEGACY_SAVE_KEYS = []; // earlier saves used a different park and cannot be carried over
export const CURRENCY = '£';

// The park's ground. Where the paths and plots go is in layout.js: each kind
// of town has its own map. The gate is always at the bottom, in the middle.
export const WORLD = {
  w: 1080,
  h: 1480,
  gateY: 1390,
  spawnY: 1500,
  queueGap: 12,
};

// Every park has the same eight things to build: four rides, then the
// entrance, the car park, the restrooms and the food stalls.
export const PLOTS = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ index: k, kind: k < 4 ? 'ride' : 'facility' }));

// Ten stars each, a star every ten levels (so level 100 at the top), and then
// one last purchase of extra capacity.
export const STAGES = 10;
export const LEVELS_PER_STAGE = 10;

export const TUNING = {
  // spins
  startTokens: 60,
  tokenCap: 60,
  tokenEvery: 120, // seconds per regenerated token
  bets: [1, 2, 3, 5, 10, 20, 50],
  betNeedsTokens: 12, // a bet of N is offered once you hold N x this many tokens
  maxShields: 3,
  // coins
  unitBase: 1000,
  unitGrowth: 1.55,
  slotWeights: [1.0, 1.25, 1.5, 1.8, 0.7, 0.8, 0.6, 0.75],
  stageWeights: [1, 1.2, 1.45, 1.7, 2, 2.3, 2.7, 3.1, 3.6, 4.2, 3], // ten stars, then the capacity upgrade
  gateRate: 0.00022, // coins a second, per star, as a share of the park's unit
  unitCapPark: 14, // prices stop climbing after this park
  spinsCap: 1800, // and no park takes more spins than this
  repairShare: 0.2,
  ticketRate: 0.0014, // coins per rider, in units, per stage
  offlineCapHours: 3,
  offlineMinSeconds: 60,
  // guests
  flowTau: 30,
  queueLimit: 9,
  maxGuests: 150,
  boardInterval: 0.16,
  boardWait: 0.9,
  walkSpeed: 96,
  // rivals
  rivalShieldChance: 0.3,
  incomingEvery: [28, 75], // minutes between pies thrown at you
  incomingMaxAway: 4,
  // flavour
  balloonEvery: [45, 80],
  dayLength: 300,
  // events
  eventHours: 48,
  leagueHours: 24,
};

// What one spin can land on. Weights are per cent of spins.
export const OUTCOMES = [
  { kind: 'coins3', w: 7.5 },
  { kind: 'sacks3', w: 3.2 },
  { kind: 'jackpot', w: 0.8 },
  { kind: 'raid', w: 5.0 },
  { kind: 'wheel', w: 6.0 },
  { kind: 'tokens', w: 3.5 },
  { kind: 'treats', w: 4.0 },
  { kind: 'mixed', w: 70.0 },
];

// No attacks and no shields: three balls win a turn on the prize wheel, three
// shells open the pearl dive.
export const SYMBOLS = ['coin', 'sack', 'barrel', 'token', 'star', 'chips', 'ball', 'fish'];
// The picture for each reel symbol (in img/). 'fish' is the starfish: it fills
// out the reels and pays nothing.
export const SYMBOL_ART = { coin: 'sym-coin', sack: 'sym-chest', barrel: 'sym-shell', token: 'ico-ticket', star: 'sym-bell', chips: 'sym-cherry', ball: 'sym-ball', fish: 'sym-star' };
export const TRIPLE = { coins3: 'coin', sacks3: 'sack', jackpot: 'star', raid: 'barrel', wheel: 'ball', tokens: 'token', treats: 'chips' };
export const MIXED_WEIGHTS = { coin: 30, sack: 12, barrel: 10, token: 9, star: 6, chips: 9, ball: 10, fish: 14 };

// Payouts in "units" (see economy.unit), before the bet multiplier.
export const PAY = {
  coin: 1,
  sack: 3,
  coins3: 12,
  sacks3: 30,
  jackpot: 100,
  attackHit: 20,
  attackBlocked: 8,
  raidStash: [30, 55],
  raidShares: [0.5, 0.3, 0.2, 0],
  shieldOverflow: 5,
  tokens: 6,
  treats: 3,
};

// The first spins of a new game follow a script so every mechanic turns up early.
export const OPENING_SPINS = ['coins3', 'mixed', 'sacks3', 'mixed', 'wheel', 'mixed', 'coins3', 'raid', 'treats', 'mixed', 'tokens'];

const A = (id, name, kind, cap, cycle, blurb, w, h) => ({ id, name, kind, cap, cycle, blurb, w, h });

export const ATTRACTIONS = [
  A('toffee', 'Toffee Apple Cart', 'stall', 2, 2.4, 'Sticky, shiny and gone in four bites.', 170, 150),
  A('ducks', 'Hook-a-Duck', 'game', 3, 3.4, 'Every duck wins a prize. Mostly.', 190, 160),
  A('teacups', 'Teacup Twirl', 'ride', 6, 6, 'A gentle spin for the brave and the dizzy.', 230, 150),
  A('helter', 'Helter Skelter', 'ride', 4, 5, 'Climb the tower, grab a mat, whoosh.', 150, 250),
  A('coconut', 'Coconut Shy', 'game', 3, 4, 'Three balls a go. The coconuts are not glued down.', 200, 160),
  A('floss', 'Candy Floss Kiosk', 'stall', 3, 3, 'Sugar clouds on a stick, spun to order.', 160, 180),
  A('dodgems', 'Dodgems', 'ride', 8, 8, 'Bump first, apologise later.', 250, 170),
  A('carousel', 'Galloping Carousel', 'ride', 10, 9, 'Painted horses and a wheezy organ.', 240, 210),
  A('ghost', 'Ghost Train', 'ride', 6, 8, 'Cobwebs, cackles and one very damp curtain.', 250, 190),
  A('waltzer', 'Whirling Waltzer', 'ride', 9, 8, 'Scream if you want to go faster.', 250, 170),
  A('wheel', 'Big Wheel', 'ride', 12, 12, 'The whole park laid out below you.', 240, 280),
  A('coaster', 'Comet Coaster', 'ride', 12, 9, 'One lift hill, one loop, no regrets.', 270, 230),
];
ATTRACTIONS.forEach((d, i) => { d.index = i; });
const idx = (id) => ATTRACTIONS.findIndex((d) => d.id === id);

// Which six attractions each park has, by plot. The tall ones sit in the back row.
// The parks. Each theme is one painted backdrop with the same layout, so the
// same eight sites sit in the same places; the rides change their names.
export const PARKS_TOTAL = 100;
export const PARK_THEMES = [
  { key: 'coral', name: 'Coral Cove', tag: 'Shells, pearls and warm shallows', rides: ['Jellyfish Swing', 'Pearl Spinner', 'Reef Runner', 'Tide Wheel'] },
  { key: 'pirate', name: 'Pirate Harbour', tag: 'Sails, maps and buried treasure', rides: ['Crow\u2019s Nest Swing', 'Compass Spinner', 'Plank Runner', 'Harbour Wheel'] },
  { key: 'jungle', name: 'Jungle Falls', tag: 'Vines, lotus pools and warm rain', rides: ['Canopy Swing', 'Lotus Spinner', 'Vine Runner', 'Falls Wheel'] },
  { key: 'winter', name: 'Snowlight Village', tag: 'Lanterns, pines and fresh snow', rides: ['Frost Swing', 'Snowflake Spinner', 'Sleigh Runner', 'Aurora Wheel'] },
];
const RIDE_BLURBS = ['Round and round over the water.', 'The showpiece in the middle of the park.', 'Fast, loud and over too soon.', 'The whole park laid out below you.'];
export const FACILITIES = [
  { id: 'entrance', name: 'Entrance', blurb: 'More gates, shorter queues.', cap: 'Gates' },
  { id: 'parking', name: 'Parking', blurb: 'Somewhere for everyone to leave the car.', cap: 'Parking spaces' },
  { id: 'restrooms', name: 'Restrooms', blurb: 'Nobody enjoys a park without them.', cap: 'Toilets' },
  { id: 'food', name: 'Food Stalls', blurb: 'Hot chips, cold drinks, sticky fingers.', cap: 'Stalls' },
];
// What stands on site k in park t.
export function buildingAt(t, k) {
  const theme = PARK_THEMES[t % PARK_THEMES.length];
  if (k < 4) return { index: k, id: 'ride' + k, name: theme.rides[k], kind: 'ride', blurb: RIDE_BLURBS[k], cap: 'Seats' };
  return { index: k, kind: 'facility', ...FACILITIES[k - 4] };
}

// Parks go on past the hundredth: looks cycle, prices are capped.
export function townInfo(t) {
  const theme = PARK_THEMES[t % PARK_THEMES.length];
  const lap = Math.floor(t / PARK_THEMES.length);
  return { index: t, number: t + 1, name: lap ? `${theme.name} ${lap + 1}` : theme.name, tag: theme.tag, theme, lineup: [0, 1, 2, 3, 4, 5, 6, 7] };
}

// The prize wheel: eight wedges, weighted.
export const WHEEL = [
  { reward: { coins: 15 }, w: 22 }, { reward: { tokens: 5 }, w: 18 }, { reward: { coins: 40 }, w: 16 }, { reward: { treats: 4 }, w: 14 },
  { reward: { tokens: 12 }, w: 10 }, { reward: { pack: 'bronze' }, w: 10 }, { reward: { coins: 120 }, w: 6 }, { reward: { pack: 'silver' }, w: 4 },
];

// ---- rivals -----------------------------------------------------------------

export const RIVALS = [
  { name: 'Dotty Marlowe', park: "Marlowe's Mirth" },
  { name: 'Big Reg Pickles', park: 'Pickles Pleasure Park' },
  { name: 'Madame Zelda Finch', park: "Finch's Fortunes" },
  { name: 'Cornelius Quill', park: 'The Quill Carnival' },
  { name: 'Nan Bramble', park: "Bramble's Bonanza" },
  { name: 'Lord Flashbang', park: 'Flashbang Follies' },
  { name: 'Mabel Sprocket', park: 'Sprocket & Daughters' },
  { name: 'The Tiddler Twins', park: 'Tiddler Towers' },
  { name: 'Captain Humbug', park: "Humbug's Hullabaloo" },
];

// ---- shop and adverts ---------------------------------------------------------

// Until a real payment and advert provider is connected (see the README), the
// shop runs in preview mode: adverts are a short stand-in and purchases are
// granted without any payment. Turn this off to show "coming soon" instead.
export const STORE_PREVIEW = true;

// Display prices are placeholders; a real store supplies localised ones.
// Coins are in units, so a sack is worth the same number of spins in any town.
export const PRODUCTS = [
  { id: 'tokens_s', group: 'tokens', name: 'Pocketful', price: '£0.99', grant: { tokens: 60 } },
  { id: 'tokens_m', group: 'tokens', name: 'Bagful', price: '£2.99', grant: { tokens: 220 }, tag: 'Popular' },
  { id: 'tokens_l', group: 'tokens', name: 'Bucketful', price: '£6.99', grant: { tokens: 600 } },
  { id: 'tokens_xl', group: 'tokens', name: 'Wheelbarrow', price: '£14.99', grant: { tokens: 1500 }, tag: 'Best value' },
  { id: 'starter', group: 'bundle', name: 'Starter bundle', price: '£1.99', grant: { tokens: 120, coins: 150, packs: { gold: 1 } }, once: true, tag: 'One time only' },
  { id: 'goldpacks', group: 'bundle', name: 'Three gold packs', price: '£3.99', grant: { packs: { gold: 3 } } },
  { id: 'coins', group: 'bundle', name: 'Sack of coins', price: '£2.99', grant: { coins: 400 } },
  {
    id: 'noads', group: 'extra', name: 'No interruptions', price: '£3.99', once: true, noAds: true,
    desc: 'Removes the adverts between towns. Adverts you choose to watch for a reward stay.',
  },
];
export const ADS = { tokens: 25, perDay: 6 };

// ---- cards ------------------------------------------------------------------

// Nine cards a set: rarity is the star count; the five-star card is the gold one.
const RARITY = [1, 1, 2, 2, 3, 3, 4, 4, 5];
const SET = (id, name, color, reward, cards) => ({ id, name, color, reward, cards });

export const CARD_SETS = [
  SET('sweets', 'Sweet Tooth', '#e93d82', 40, [
    ['toffeeapple', 'Toffee Apple'], ['lolly', 'Swirly Lolly'], ['floss', 'Candy Floss'], ['rock', 'Stick of Rock'],
    ['icecream', 'Ninety-Nine'], ['doughnut', 'Hot Doughnut'], ['popcorn', 'Popcorn Tub'], ['humbug', 'Mint Humbug'],
    ['sundae', 'Knickerbocker Glory'],
  ]),
  SET('prizes', 'Every One a Winner', '#3e63dd', 60, [
    ['duck', 'Rubber Duck'], ['coconut', 'Coconut'], ['hoopla', 'Hoopla Ring'], ['mallet', 'Test-Your-Strength Mallet'],
    ['dart', 'Lucky Dart'], ['cans', 'Tin Can Alley'], ['goldfish', 'Goldie'], ['yoyo', 'Light-up Yo-yo'],
    ['teddy', 'Giant Teddy'],
  ]),
  SET('showfolk', 'The Showfolk', '#8e4ec6', 90, [
    ['tophat', "Ringmaster's Hat"], ['megaphone', 'Megaphone'], ['tickets', 'Roll of Tickets'], ['clubs', 'Juggling Clubs'],
    ['dumbbell', "Strongman's Dumbbell"], ['crystal', 'Crystal Ball'], ['drum', 'Big Bass Drum'], ['moustache', 'Waxed Moustache'],
    ['organ', 'Barrel Organ'],
  ]),
  SET('lights', 'Bright Lights', '#f76b15', 120, [
    ['bulb', 'Fairground Bulb'], ['lantern', 'Paper Lantern'], ['bunting', 'String of Bunting'], ['sparkler', 'Sparkler'],
    ['rocket', 'Sky Rocket'], ['glitter', 'Glitter Ball'], ['moon', 'Harvest Moon'], ['neon', 'Neon Star'],
    ['catherine', 'Catherine Wheel'],
  ]),
  SET('seaside', 'Seaside Special', '#12a594', 160, [
    ['bucket', 'Bucket and Spade'], ['beachball', 'Beach Ball'], ['deckchair', 'Deckchair'], ['chipcone', 'Cone of Chips'],
    ['crab', 'Cheeky Crab'], ['sandcastle', 'Sandcastle'], ['postcard', 'Saucy Postcard'], ['lighthouse', 'Lighthouse'],
    ['gull', 'Chips the Gull'],
  ]),
  SET('rides', 'Grand Rides', '#e5484d', 220, [
    ['ride:teacups', 'Teacup Twirl'], ['ride:dodgems', 'Dodgems'], ['ride:helter', 'Helter Skelter'], ['ride:ghost', 'Ghost Train'],
    ['ride:waltzer', 'Whirling Waltzer'], ['ride:carousel', 'Galloping Carousel'], ['ride:coaster', 'Comet Coaster'],
    ['ride:wheel', 'Big Wheel'], ['bandstand', 'The Bandstand'],
  ]),
];

export const CARDS = [];
CARD_SETS.forEach((set, s) => {
  set.index = s;
  set.cards = set.cards.map(([art, name], k) => {
    const card = { id: `${set.id}-${k}`, set: s, slot: k, art, name, stars: RARITY[k], gold: RARITY[k] === 5 };
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
export const ALBUM_REWARD = { tokens: 500 };

// ---- pet --------------------------------------------------------------------

export const PET = {
  name: 'Chips',
  xpFor: (level) => 6 + level * 6 + level * level,
  maxLevel: 30,
  raidBonusPerLevel: 0.05,
  capPerLevel: 2,
  levelTokens: (level) => 6 + level * 2,
};

// ---- events -----------------------------------------------------------------

export const EVENT_THEMES = [
  { name: 'Bulb Rush', blurb: 'Every spin lights another bulb.' },
  { name: 'Ticket Frenzy', blurb: 'Tear through the roll, one spin at a time.' },
  { name: 'Bunting Bash', blurb: 'String it from the gate to the bandstand.' },
  { name: 'Organ Marathon', blurb: 'Keep the organ wheezing all weekend.' },
];
export const EVENT_POINTS = { spin: 1, triple: 3, attack: 8, raid: 12, jackpot: 25 };
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

export const LEAGUE_POINTS = { hit: 10, blocked: 5, barrel: 4, sweep: 6, wheel: 8 };
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

export const UPGRADE_REWARDS = { 5: { tokens: 2 }, 10: { pack: 'bronze' } };
export const TOWN_REWARD = { tokens: 25, pack: 'gold' };

export const GUEST_LOOKS = {
  shirts: ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#f5f5f5', '#30a46c', '#0090ff', '#ad7f58'],
  skins: ['#f6d2b8', '#eab894', '#c98e62', '#a06a42', '#7a4a2c', '#f9dcc4'],
  hairs: ['#2b2118', '#5a3b22', '#8a5a2b', '#d9a441', '#b03a2e', '#cfcfcf', '#161616'],
  trousers: ['#2f3a5c', '#3d3d3d', '#5b4a3a', '#274060', '#4a2f4f'],
};
