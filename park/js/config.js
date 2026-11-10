// Game data and tuning. Everything that shapes the economy lives here so the
// game, the tests and the balance tool all read the same numbers.

export const GAME_TITLE = 'Park!';
export const VERSION = '4.0.0';
export const SAVE_KEY = 'park.save.v1';
// saves written under an earlier name are picked up once and carried over
export const LEGACY_SAVE_KEYS = ['starlight-funfair.save.v2'];
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

export const PLOTS = [0, 1, 2, 3, 4, 5].map((k) => ({ index: k }));

export const STAGES = 5;

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
  slotWeights: [0.6, 0.8, 1.0, 1.1, 1.2, 1.3],
  stageWeights: [1, 1.6, 2.4, 3.4, 4.6],
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
  { kind: 'coins3', w: 6.0 },
  { kind: 'sacks3', w: 2.6 },
  { kind: 'jackpot', w: 0.7 },
  { kind: 'attack', w: 7.0 },
  { kind: 'raid', w: 4.5 },
  { kind: 'shield', w: 6.0 },
  { kind: 'tokens', w: 3.0 },
  { kind: 'treats', w: 4.0 },
  { kind: 'mixed', w: 66.2 },
];

export const SYMBOLS = ['coin', 'sack', 'pie', 'barrel', 'lock', 'token', 'star', 'chips'];
export const TRIPLE = { coins3: 'coin', sacks3: 'sack', jackpot: 'star', attack: 'pie', raid: 'barrel', shield: 'lock', tokens: 'token', treats: 'chips' };
export const MIXED_WEIGHTS = { coin: 30, sack: 12, pie: 14, barrel: 9, lock: 12, token: 9, star: 5, chips: 9 };

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
export const OPENING_SPINS = ['coins3', 'mixed', 'sacks3', 'mixed', 'attack', 'mixed', 'shield', 'raid', 'treats', 'mixed', 'tokens'];

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
const LINEUPS = [
  ['toffee', 'ducks', 'teacups', 'coconut', 'floss', 'helter'],
  ['coconut', 'floss', 'dodgems', 'carousel', 'ghost', 'wheel'],
  ['toffee', 'teacups', 'waltzer', 'dodgems', 'helter', 'coaster'],
  ['ducks', 'floss', 'carousel', 'ghost', 'wheel', 'coaster'],
  ['toffee', 'coconut', 'teacups', 'waltzer', 'helter', 'wheel'],
  ['ducks', 'dodgems', 'carousel', 'ghost', 'waltzer', 'coaster'],
].map((row) => row.map(idx));

// Each kind of town: its palette, its weather, and (in layout.js) its map.
const BASE = {
  board: '#b88d60', boardEdge: '#7f5c3a', stone: '#c9c0ae', stoneEdge: '#8e8676', soil: '#5e4a36',
  blooms: ['#e8607a', '#f2c14e', '#f7f3e8', '#b98ad6', '#ef8a4a'], foam: '#d8f1ee', weather: null,
};
export const THEMES = [
  {
    ...BASE, key: 'green', ground: '#6c9c58', ground2: '#618f4e', tuft: '#527c41', path: '#e7d9b6', pathEdge: '#bfae87',
    plot: '#83b267', tree: ['#3f7d47', '#5d9c56', '#2a5c3a'], trunk: '#5c4630', fence: '#efe6cf', bank: '#9aa66a',
    water: ['#2b7186', '#4fa3ad'], fruit: '#f2c14e',
  },
  {
    ...BASE, key: 'sand', ground: '#e8d6a8', ground2: '#decb96', tuft: '#cbb37b', path: '#dccbaa', pathEdge: '#b7a37c',
    plot: '#f0e2bb', tree: ['#3a8a6a', '#58a983', '#27694f'], trunk: '#7a5a38', fence: '#f7f1e1', bank: '#d3bd88',
    water: ['#1f6d93', '#49b3bf'], stone: '#e3d8c0', stoneEdge: '#b3a481',
  },
  {
    ...BASE, key: 'autumn', ground: '#a39652', ground2: '#958847', tuft: '#82763a', path: '#decca5', pathEdge: '#b6a279',
    plot: '#b3a860', tree: ['#c8742c', '#e09b3a', '#9c4722'], trunk: '#553a24', fence: '#efe0be', bank: '#8f8348',
    water: ['#3b6f78', '#5f9a98'], weather: 'leaves', fruit: '#b3343c', blooms: ['#c8742c', '#e09b3a', '#8f2f2a', '#f2c14e', '#6b3a5c'],
  },
  {
    ...BASE, key: 'snow', ground: '#e8eef5', ground2: '#dae4ee', tuft: '#c3d1e0', path: '#b7c2cf', pathEdge: '#93a2b4',
    plot: '#f4f8fc', tree: ['#2c6b5b', '#eef4fa', '#1f5347'], trunk: '#54412f', fence: '#b8454a', bank: '#f7fafd',
    water: ['#b9d6e6', '#dcedf5'], weather: 'snow', soil: '#cfdbe6',
  },
  {
    ...BASE, key: 'city', ground: '#7b8395', ground2: '#727a8d', tuft: '#666e83', path: '#b8ad9b', pathEdge: '#8d8272',
    plot: '#8d94a6', tree: ['#c5698d', '#dc8fac', '#9f4a72'], trunk: '#4a3838', fence: '#2a3142', bank: '#8e8676',
    water: ['#1c4f63', '#2f7482'], weather: 'petals', stone: '#aba392', stoneEdge: '#7d7566',
  },
];

const TOWN_NAMES = [
  ['Puddlewick Green', 'A sleepy village green'],
  ['Saltmarsh Sands', 'Deckchairs and sea air'],
  ['Coppermill Common', 'Bonfire smoke and falling leaves'],
  ['Frostholm', 'Mittens, mulled apple and snow'],
  ['Lanternport', 'Cobbles, canals and paper lanterns'],
  ['Bramblecombe', 'Hedgerows heavy with blackberries'],
  ['Gullhaven Pier', 'Chips, gulls and a brass band'],
  ['Emberwick', 'Chestnuts roasting on every corner'],
  ['Snowmere', 'A frozen lake and a thousand lanterns'],
  ['Glimmergate', 'The city that never dims'],
  ['Thistledown', 'Morris dancers and maypoles'],
  ['Shellborough', 'Rock pools and striped windbreaks'],
  ['Russetford', 'Cider presses and conker fights'],
  ['Icicle Cross', 'Sleigh bells on the high street'],
  ['Moonquay', 'Harbour lights and midnight markets'],
];

// Towns go on for ever: names and looks cycle, prices keep climbing.
export function townInfo(t) {
  const [base, tag] = TOWN_NAMES[t % TOWN_NAMES.length];
  const lap = Math.floor(t / TOWN_NAMES.length);
  return {
    index: t,
    name: lap ? `${base} ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(lap - 1, 8)]}` : base,
    tag,
    theme: THEMES[t % THEMES.length],
    lineup: LINEUPS[t % LINEUPS.length],
  };
}

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
export const ADS = { tokens: 10, perDay: 5 };

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

export const LEAGUE_POINTS = { hit: 10, blocked: 5, barrel: 4, sweep: 6 };
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

export const UPGRADE_REWARDS = { 3: { tokens: 3 }, 5: { pack: 'bronze' } };
export const TOWN_REWARD = { tokens: 25, pack: 'gold' };

export const GUEST_LOOKS = {
  shirts: ['#e5484d', '#f76b15', '#ffc53d', '#46a758', '#12a594', '#3e63dd', '#8e4ec6', '#e93d82', '#f5f5f5', '#30a46c', '#0090ff', '#ad7f58'],
  skins: ['#f6d2b8', '#eab894', '#c98e62', '#a06a42', '#7a4a2c', '#f9dcc4'],
  hairs: ['#2b2118', '#5a3b22', '#8a5a2b', '#d9a441', '#b03a2e', '#cfcfcf', '#161616'],
  trousers: ['#2f3a5c', '#3d3d3d', '#5b4a3a', '#274060', '#4a2f4f'],
};
