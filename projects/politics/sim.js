/*
================================================================================
 GLASS BOX · POLITICS  -  sim.js
================================================================================
 A small made-up country (Veyland) where politics is learned, not scripted.

 One step = one month. Every month:
   1. People age, die, and are replaced by their children (who inherit some of
      their parent's beliefs and stories).
   2. The economy runs: firms produce, wages and profits are paid, the state
      taxes and spends, unemployment and crime follow from the laws in force.
   3. Every citizen feels their needs (money, health, safety, freedom,
      fairness, dignity at work) and learns from what happened:
        - BELIEFS: "when this law went up a year ago, did my life get better?"
          (an online regression, one weight per law, starting at zero)
        - ACTIONS: stay quiet, protest, strike or rise up (Q-learning on their
          own experience: what happened to them after they acted). They learn
          a few weights per action: how much being unhappy, a crowd nearby,
          strong police, and believing in another system make it worth it
        - TRUST in each party, from how life went while that party governed
        - MEMORY of each system of government they have lived under
      They also talk to neighbours and copy a little of what they believe.
   4. Unrest is counted. If the people (and the police) who want a different
      system outweigh those who defend the current one, there is a revolution
      and the new system is whatever most of them wanted.
   5. Whoever holds power changes the laws, depending on the system:
        elections  - parties evolve their promises by testing candidates in polls
        party/army - a ruling faction evolves by testing its plans on its base
        experts    - technocrats evolve plans by forecasting with the economy model
        councils   - workers' councils vote law by law on what members believe
        assembly   - every citizen votes law by law
   6. Lobbies (business, unions, smallholders) learn whether to save, donate
      to a party, or bribe the government. Governments learn whether taking
      bribes pays. A free press finds some of them out.

 Nothing below decides what anyone does. The code sets the world's rules
 (how an economy responds to laws, who can vote, how force works); the
 agents' choices come from what they learned.

 Works in pages (window.Politics) and in Node (module.exports). Needs
 Brain (../embodied-2d/brain.js) for makeRng and Network.
================================================================================
*/
(function (root) {
'use strict';
const Brain = root.Brain || (typeof require !== 'undefined' ? require('../embodied-2d/brain.js') : null);
const { makeRng, Network, toBase64, fromBase64 } = Brain;

/* ---------------- the laws ---------------- */
const POLICIES = [
  { id: 'tax',        name: 'Taxes',             lo: 'low',  hi: 'high' },
  { id: 'welfare',    name: 'Welfare & pensions' },
  { id: 'services',   name: 'Health & schools' },
  { id: 'wage',       name: 'Minimum wage' },
  { id: 'unions',     name: 'Union power' },
  { id: 'state',      name: 'State ownership' },
  { id: 'coops',      name: 'Worker co-ops' },
  { id: 'smallprop',  name: 'Small property',    help: 'Breaking up big estates and firms into family farms and workshops' },
  { id: 'regulation', name: 'Regulation' },
  { id: 'police',     name: 'Police & army' },
  { id: 'liberty',    name: 'Free speech & press' },
  { id: 'trade',      name: 'Open trade' },
];
const NP = POLICIES.length;
const L = {}; POLICIES.forEach((p, i) => { L[p.id] = i; });

const NEEDS = ['Money', 'Health', 'Safety', 'Freedom', 'Fairness', 'Dignity'];
const NN = NEEDS.length;

/* ---------------- systems of government ----------------
   rule: how laws get made.  lock: ranges this system forces some laws into.
   typical: what citizens imagine life under it would be (used to judge it). */
const vec = o => POLICIES.map(p => o[p.id]);
const IDEOLOGIES = [
  { id: 'democracy', name: 'Liberal democracy', rule: 'elections', hue: '#3987e5',
    blurb: 'Parties compete in free elections. Private firms, a free press, laws made by whoever wins.',
    lock: { liberty: [0.6, 1] },
    typical: vec({ tax: .35, welfare: .35, services: .45, wage: .35, unions: .35, state: .1, coops: .05, smallprop: .3, regulation: .4, police: .4, liberty: .85, trade: .6 }) },
  { id: 'communism', name: 'Communism', rule: 'party', hue: '#e66767', faction: "Workers' Unity Party",
    blurb: 'One party runs the state, the state runs the economy. Jobs for all, little freedom.',
    lock: { state: [0.85, 1], coops: [0, 0.1], smallprop: [0, 0.15], liberty: [0, 0.25], police: [0.6, 1], unions: [0.2, 0.4] },
    typical: vec({ tax: .7, welfare: .6, services: .7, wage: .6, unions: .3, state: .95, coops: .05, smallprop: .05, regulation: .6, police: .8, liberty: .1, trade: .2 }) },
  { id: 'syndicalism', name: 'Syndicalism', rule: 'councils', hue: '#d95926',
    blurb: 'Unions own and run the industries. Workers\' councils vote on each law.',
    lock: { unions: [0.9, 1], coops: [0.7, 1], state: [0, 0.2], liberty: [0.45, 1] },
    typical: vec({ tax: .4, welfare: .5, services: .6, wage: .8, unions: 1, state: .1, coops: .85, smallprop: .3, regulation: .5, police: .3, liberty: .6, trade: .4 }) },
  { id: 'mutualism', name: 'Mutualism', rule: 'assembly', hue: '#199e70',
    blurb: 'Co-ops and small owners trade freely, a tiny state, everyone votes directly on each law.',
    lock: { coops: [0.5, 1], smallprop: [0.6, 1], state: [0, 0.1], tax: [0, 0.25], police: [0, 0.25], liberty: [0.8, 1] },
    typical: vec({ tax: .15, welfare: .3, services: .4, wage: .4, unions: .6, state: .05, coops: .65, smallprop: .75, regulation: .3, police: .15, liberty: .9, trade: .6 }) },
  { id: 'distributism', name: 'Distributism', rule: 'elections', hue: '#c98500',
    blurb: 'Property spread widely: family farms, workshops, guilds. Elections, but no giant firms.',
    lock: { smallprop: [0.75, 1], state: [0, 0.25], coops: [0.3, 0.7], liberty: [0.5, 1] },
    typical: vec({ tax: .35, welfare: .4, services: .5, wage: .45, unions: .5, state: .15, coops: .4, smallprop: .9, regulation: .5, police: .4, liberty: .7, trade: .35 }) },
  { id: 'fascism', name: 'Fascism', rule: 'party', hue: '#8a6a4a', faction: 'Iron Front',
    blurb: 'One party, the nation above all. Unions banned, big firms kept loyal, a strong police.',
    lock: { liberty: [0, 0.15], unions: [0, 0.05], coops: [0, 0.05], police: [0.85, 1], trade: [0, 0.35] },
    typical: vec({ tax: .45, welfare: .3, services: .4, wage: .3, unions: 0, state: .3, coops: 0, smallprop: .2, regulation: .6, police: 1, liberty: .05, trade: .15 }) },
  { id: 'technocracy', name: 'Technocracy', rule: 'experts', hue: '#9085e9', faction: 'Bureau of Experts',
    blurb: 'No elections. Experts with an economic model pick the laws they forecast will work best.',
    lock: { liberty: [0.35, 0.7] },
    typical: vec({ tax: .4, welfare: .4, services: .6, wage: .4, unions: .3, state: .25, coops: .1, smallprop: .3, regulation: .6, police: .4, liberty: .5, trade: .6 }) },
  { id: 'freemarket', name: 'Free-market minarchy', rule: 'elections', hue: '#d55181',
    blurb: 'Elections, but the state is kept tiny: almost no taxes, welfare or rules.',
    lock: { tax: [0, 0.15], welfare: [0, 0.1], state: [0, 0.05], regulation: [0, 0.2], wage: [0, 0.1], liberty: [0.75, 1] },
    typical: vec({ tax: .1, welfare: .05, services: .15, wage: 0, unions: .1, state: 0, coops: .05, smallprop: .3, regulation: .1, police: .3, liberty: .9, trade: .95 }) },
  { id: 'junta', name: 'Military junta', rule: 'party', hue: '#7d8a5a', faction: 'Council of Generals',
    blurb: 'The army rules. Order first, no elections, little freedom.',
    lock: { police: [0.9, 1], liberty: [0, 0.2] },
    typical: vec({ tax: .3, welfare: .2, services: .3, wage: .25, unions: .1, state: .25, coops: .05, smallprop: .25, regulation: .4, police: 1, liberty: .1, trade: .4 }) },
];
const NI = IDEOLOGIES.length;
const IDX = {}; IDEOLOGIES.forEach((d, i) => { IDX[d.id] = i; });
IDEOLOGIES.forEach(d => {
  d.lo = new Float32Array(NP).fill(0); d.hi = new Float32Array(NP).fill(1);
  for (const k in d.lock) { d.lo[L[k]] = d.lock[k][0]; d.hi[L[k]] = d.lock[k][1]; }
});

/* What a party's promises look like, for naming where it has drifted to. */
const FAMILIES = [
  { name: 'Social democrats', v: vec({ tax: .5, welfare: .6, services: .65, wage: .55, unions: .55, state: .15, coops: .1, smallprop: .3, regulation: .55, police: .4, liberty: .85, trade: .55 }) },
  { name: 'Conservatives',    v: vec({ tax: .25, welfare: .25, services: .35, wage: .2, unions: .15, state: .1, coops: .02, smallprop: .35, regulation: .3, police: .65, liberty: .65, trade: .5 }) },
  { name: 'Liberals',         v: vec({ tax: .2, welfare: .2, services: .35, wage: .2, unions: .2, state: .05, coops: .05, smallprop: .3, regulation: .25, police: .3, liberty: .95, trade: .85 }) },
  { name: 'Greens',           v: vec({ tax: .45, welfare: .45, services: .6, wage: .4, unions: .4, state: .1, coops: .2, smallprop: .4, regulation: .9, police: .25, liberty: .85, trade: .4 }) },
  { name: 'Socialists',       v: vec({ tax: .6, welfare: .6, services: .7, wage: .7, unions: .7, state: .5, coops: .25, smallprop: .3, regulation: .6, police: .35, liberty: .75, trade: .35 }) },
  { name: 'Nationalists',     v: vec({ tax: .35, welfare: .35, services: .35, wage: .35, unions: .2, state: .2, coops: .02, smallprop: .3, regulation: .35, police: .85, liberty: .35, trade: .15 }) },
  { name: 'Centrists',        v: IDEOLOGIES[0].typical },
  { name: 'Communists',       v: IDEOLOGIES[1].typical },
  { name: 'Syndicalists',     v: IDEOLOGIES[2].typical },
  { name: 'Mutualists',       v: IDEOLOGIES[3].typical },
  { name: 'Distributists',    v: IDEOLOGIES[4].typical },
  { name: 'Fascists',         v: IDEOLOGIES[5].typical },
  { name: 'Technocrats',      v: IDEOLOGIES[6].typical },
  { name: 'Free-marketeers',  v: IDEOLOGIES[7].typical },
  { name: 'Militarists',      v: IDEOLOGIES[8].typical },
];
function familyOf(platform) {
  let best = null, bd = Infinity;
  for (const f of FAMILIES) {
    let d = 0; for (let p = 0; p < NP; p++) d += (platform[p] - f.v[p]) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best.name;
}

/* ---------------- the map ---------------- */
const REGIONS = [
  { name: 'Oldbridge', kind: 'the capital',      x: .47, y: .44, industry: .3, bias: { owner: 2.5, small: .6, official: 2.4 } },
  { name: 'Ironvale',  kind: 'factory towns',    x: .70, y: .30, industry: .9, bias: { owner: 1.2, small: .5, official: .7 } },
  { name: 'Redfield',  kind: 'farmland',         x: .28, y: .66, industry: .1, bias: { owner: .6, small: 2.6, official: .6 } },
  { name: 'Saltmere',  kind: 'a port',           x: .76, y: .68, industry: .5, bias: { owner: 1.4, small: .9, official: 1 } },
  { name: 'Highcombe', kind: 'mining hills',     x: .30, y: .25, industry: .8, bias: { owner: .7, small: .6, official: .7 } },
  { name: 'Fenwick',   kind: 'forest villages',  x: .52, y: .82, industry: .15, bias: { owner: .4, small: 2.2, official: .6 } },
];
const NR = REGIONS.length;

const SYL1 = ['Al', 'Bre', 'Cal', 'Dar', 'El', 'Fen', 'Gar', 'Hal', 'Ise', 'Jor', 'Kel', 'Lio', 'Mar', 'Nel', 'Or', 'Pell', 'Quin', 'Ros', 'Sel', 'Tam', 'Ul', 'Ves', 'Wen', 'Yor', 'Zan', 'Ari', 'Bel', 'Cor', 'Dal', 'Emm'];
const SYL2 = ['a', 'en', 'ic', 'o', 'ia', 'an', 'is', 'eth', 'ra', 'el', 'in', 'us', 'ie', 'ard', 'wyn', 'ora', 'ik', 'ette', 'mer', 'ton'];
const SUR1 = ['Varn', 'Holt', 'Esk', 'Drey', 'Kell', 'Brand', 'Rook', 'Fell', 'Ward', 'Lun', 'Corr', 'Thal', 'Mar', 'Ost', 'Hale', 'Brin', 'Tarr', 'Wex', 'Asp', 'Grell'];
const SUR2 = ['ley', 'mont', 'by', 'ard', 'ell', 'sen', 'ton', 'ow', 'ing', 'er', 'wick', 'stead'];
const PARTY_A = ['Civic', "People's", 'New', 'United', 'Free', 'National', 'Popular', 'Democratic', 'Radical', 'Common', 'Progressive', 'Rural', 'Harbour', 'Labour', 'Citizens\''];
const PARTY_B = ['Union', 'Front', 'Alliance', 'League', 'Movement', 'Party', 'Commonwealth', 'Rally', 'Bloc', 'Congress', 'Forward', 'Accord'];
// Party colours: dark-surface categorical slots, assigned in founding order (a colour follows its party).
const PARTY_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/* ---------------- helpers ---------------- */
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
/** A fixed personal liking (-1..1) of one citizen for one party: nothing learned, just people being different. */
function taste(cid, pid) {
  let h = (cid * 2654435761 ^ (parseInt(pid.slice(1), 10) * 40503)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 * 2 - 1;
}
const sig = x => 1 / (1 + Math.exp(-x));
// Brains see the country and answer with every law, plus two big choices: campaign for a new system, and go to war.
const OUT_CHANGE = NP, OUT_WAR = NP + 1;
const BRAIN_SIZES = [12, 8, NP + 2];
const INPUT_NAMES = ['Unemployment', 'Inequality', 'Growth', 'Crime', 'Debt', 'Unrest', 'Happiness', 'Our support', 'In power', 'Election soon', 'At war', 'Winning the war'];
const OUTPUT_NAMES = POLICIES.map(p => p.name).concat(['New system', 'Go to war']);
// Citizens' beliefs: one weight per law, plus one for "being at war with Ostria".
const W_WAR = NP, NW = NP + 1;
const NEIGHBOUR = 'Ostria';
const LOBBY_ACTIONS = ['Save', 'Donate', 'Bribe', 'Buy press'];
const NLA = LOBBY_ACTIONS.length;
const SAVE_FORMAT = 'glassbox-politics';
const ACTIONS = ['Stay quiet', 'Protest', 'Strike', 'Rise up'];
const NA = ACTIONS.length;
const ACTION_COST = [0, 0.05, 0.08, 0.15];   // time, effort and risk of acting
const IDEALS = [0, 0.3, 0.3, 1.2];            // how much acting for a cause they believe in means to someone
// What a citizen looks at when deciding whether to act. They learn one weight per feature per action.
const FEATURES = ['Always', 'Unhappy', 'Crowd nearby', 'Police strength', 'Believes in another system'];
const NF = FEATURES.length;
const CAUTION = 0.15;        // how risky voters find big changes to a law
const HOPE = 10;            // how strongly an expected change in satisfaction sways a choice

/* =============================================================================
   The world
============================================================================= */
class World {
  constructor(opts = {}) {
    this.seed = (opts.seed >>> 0) || 1;
    this.rng = makeRng(this.seed);
    this.N = opts.population || 600;
    this.month = 0;
    this.nextId = 1;
    this.events = [];
    this.history = [];
    this.elections = [];
    this.regimeLog = [];
    this.parties = [];
    this.deadParties = [];
    this.faction = null;
    this.partyCount = 0;

    // economy
    this.A = 100;                 // productivity: crowns produced per worker per month
    this.g = 1;                   // world demand (1 = normal)
    this.C = 0.05;                // corruption level
    this.debt = 0;                // crowns
    this.debtRatio = 0.3;
    this.austerity = 0;           // months of forced cuts left after a debt crisis
    this.payFactor = 1;           // share of promised pay, pensions and benefits the state can actually pay
    this.u = 0.06;
    this.strikeBoost = 0;
    this.strikeFrac = 0; this.protestFrac = 0; this.riotFrac = 0;
    this.gini = 0.35; this.growth = 0; this.meanS = 0.5; this.crime = new Float32Array(NR).fill(0.1);
    this.unrestRun = 0;
    this.shares = { big: .55, small: .30, state: .10, coop: .05 };

    this.regime = IDX.democracy;
    this.regimeSince = 0;
    this.P = Float32Array.from([.35, .3, .4, .3, .3, .1, .05, .3, .4, .4, .75, .5]);
    this.target = Float32Array.from(this.P);
    this.Phist = [];              // policy vector each month, for "a year ago"
    this.pending = [];            // bribes not yet found out

    // neighbours and the wider world
    this.ostria = { A: 100, army: 0.45 };   // the neighbouring country: its economy and its army
    this.war = null; this.wars = []; this.lastWarEnd = -180;
    this.abroad = 0.62;                     // how good life is abroad, for someone who emigrates
    this.letters = []; this.departures = [];
    this.emigYear = 0; this.immigYear = 0; this.caughtYear = 0;
    // who owns the newspapers
    this.press = { independent: 1, state: 0, industry: 0, unions: 0, small: 0 };
    // peaceful change of system: an amendment in progress, or a long run of wanting change
    this.amendment = null; this.directRun = null; this.pactRun = null;
    // events: how hard each region has been hit lately, tension with Ostria, sanctions, a succession struggle
    this.hurt = new Float32Array(NR); this.tension = 0; this.sanctions = 0; this.succession = 0;
    this.lastScandal = null; this.mineralsFound = false; this.news = {};

    this.N0 = this.N;
    this.citizens = []; this.freeHomes = []; this.nextHome = 0;
    for (let i = 0; i < this.N; i++) { const c = this._newCitizen(null, 18 + this.rng() * 62); c.home = this.nextHome++; this.citizens.push(c); }
    this._reconcileClasses(true);

    this.lobbies = [
      { id: 'industry', name: 'Industry Council', cls: 'owner', money: 0, q: new Float32Array(4 * NLA), last: null, top: 0, dir: 0, sBefore: 0, log: [] },
      { id: 'unions', name: "Workers' Federation", cls: 'worker', money: 0, q: new Float32Array(4 * NLA), last: null, top: 0, dir: 0, sBefore: 0, log: [] },
      { id: 'small', name: "Smallholders' League", cls: 'small', money: 0, q: new Float32Array(4 * NLA), last: null, top: 0, dir: 0, sBefore: 0, log: [] },
    ];

    const start = IDX[opts.start] ?? IDX.democracy;
    if (IDEOLOGIES[start].rule === 'elections') {
      this.regime = start;
      for (let k = 0; k < 6; k++) this._foundParty(null);
      this.nextElection = 12;     // first election after a year, so citizens have learned a little
      this._formCaretaker();
    } else this._changeRegime(start, 'vote');
    this.regimeLog = [{ month: 0, regime: this.regime, how: 'start' }];
    this._economy();
    for (const c of this.citizens) { c.s = this._feel(c); c.sHist.fill(c.s); c.sRef = c.s; }
    this.REF = this.meanIncome;   // what "a normal income" meant at the start (money need is absolute)
    this.log(`Year 0. Veyland starts as a ${IDEOLOGIES[this.regime].name.toLowerCase()}${this.parties.length ? ` with ${this.parties.length} new parties` : ''}. Nobody knows yet what any law does.`, 'start');
  }

  get year() { return this.month / 12; }
  get ideology() { return IDEOLOGIES[this.regime]; }
  log(text, kind = 'info') {
    this.events.push({ month: this.month, text, kind });
    if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
  }

  /* ---------------- citizens ---------------- */
  _newCitizen(parent, age, region) {
    const r = this.rng;
    if (region == null) region = parent ? parent.region : Math.floor(r() * NR);
    const c = {
      id: this.nextId++, name: SYL1[Math.floor(r() * SYL1.length)] + SYL2[Math.floor(r() * SYL2.length)],
      age, region, home: -1,   // home: their spot on the map (a child keeps the family home)
      cls: 'worker', firm: 'big', employed: true, jailed: 0,
      skill: Math.exp(r.gauss() * 0.35), wealthF: Math.exp(r.gauss() * 0.6),
      values: new Float32Array(NN), needs: new Float32Array(NN),
      w: new Float32Array(NW), trend: 0, judge: new Float32Array(NI), abroad: 0.55 + r.gauss() * 0.05, q: new Float32Array(NA * NF), feat: new Float32Array(NF), trust: {}, memory: new Float32Array(NI).fill(NaN),
      sHist: new Float32Array(12), s: 0.5, sRef: 0.5, income: 0, net: 0, incSmooth: 0,
      action: 0, fav: this.regime, favScore: 0, lastVote: null, voteIntent: null, born: this.month,
      parentId: parent ? parent.id : null, arrests: 0, revolutions: 0, immigrant: false,
    };
    for (let k = 0; k < NN; k++) c.values[k] = clamp(1 + r.gauss() * 0.4, 0.2, 1.8);
    for (let p = 0; p < NW; p++) c.w[p] = r.gauss() * 0.03;               // hunches, not knowledge
    for (let a = 1; a < NA; a++) c.q[a * NF] = -ACTION_COST[a];   // wary of trouble at first
    if (parent) {
      // children grow up hearing their parent's views and stories, but make up their own minds
      for (let p = 0; p < NW; p++) c.w[p] = parent.w[p] * 0.6 + r.gauss() * 0.05;
      c.abroad = parent.abroad;
      for (let k = 0; k < NI; k++) c.memory[k] = parent.memory[k];
      for (let k = 0; k < NN; k++) c.values[k] = clamp(parent.values[k] * 0.5 + c.values[k] * 0.5, 0.2, 1.8);
      for (let i = 0; i < c.q.length; i++) c.q[i] = c.q[i] * 0.7 + parent.q[i] * 0.3;
      for (const id in parent.trust) c.trust[id] = parent.trust[id] * 0.5;
      if ((parent.cls === 'owner' || parent.cls === 'small') && r() < 0.7) c.cls = parent.cls;
      c.wealthF = parent.wealthF * 0.7 + c.wealthF * 0.3;
      c.s = parent.s; c.sHist.fill(parent.s); c.sRef = parent.s;
    }
    if (age >= 65) c.cls = 'retired';
    for (const party of this.parties) if (!(party.id in c.trust)) c.trust[party.id] = r.gauss() * 0.1;
    return c;
  }

  /** Keeps the number of owners, smallholders and officials in line with who owns what. */
  _reconcileClasses(initial) {
    const r = this.rng, P = this.P, sh = this.shares;
    const working = this.citizens.filter(c => c.cls !== 'retired');
    const n = working.length;
    const target = {
      owner: Math.round(n * (0.004 + 0.07 * sh.big)),
      small: Math.round(n * (0.06 + 0.5 * sh.small)),
      official: Math.round(n * (0.03 + 0.07 * P[L.services] + 0.05 * P[L.police] + 0.03 * P[L.state])),
    };
    for (const cls of ['owner', 'small', 'official']) {
      let have = working.filter(c => c.cls === cls);
      while (have.length > target[cls]) {
        const c = have.splice(Math.floor(r() * have.length), 1)[0];
        c.cls = 'worker';
        if (!initial && cls === 'owner') c.wealthF *= 0.3;   // lost their firm
      }
      if (have.length < target[cls]) {
        const pool = working.filter(c => c.cls === 'worker');
        while (have.length < target[cls] && pool.length) {
          // prefer regions where this kind of person lives (farmers in farmland...)
          let tot = 0; for (const c of pool) tot += REGIONS[c.region].bias[cls] * (cls === 'owner' ? c.wealthF : 1);
          let x = r() * tot, k = 0;
          for (; k < pool.length - 1; k++) { x -= REGIONS[pool[k].region].bias[cls] * (cls === 'owner' ? pool[k].wealthF : 1); if (x <= 0) break; }
          const c = pool.splice(k, 1)[0];
          c.cls = cls; have.push(c);
        }
      }
    }
    // which kind of firm each worker works for
    const tot = sh.big + sh.state + sh.coop;
    for (const c of working) if (c.cls === 'worker') {
      const x = r() * tot;
      const want = x < sh.big ? 'big' : x < sh.big + sh.state ? 'state' : 'coop';
      if (initial || r() < 0.08) c.firm = want;
    }
  }

  /* ---------------- the economy ---------------- */
  _targets(P, sh, W = this) {
    const lam = clamp(0.5 + 0.2 * P[L.unions] + 0.12 * P[L.wage] - 0.05 * P[L.trade] + W.strikeBoost, 0.4, 0.88);
    const demand = Math.pow(W.g, 0.4 + P[L.trade]) * (W.austerity > 0 ? 0.93 : 1);
    const reg = P[L.regulation], tax = P[L.tax];
    const E = (1 - 0.4 * W.C) * (1 + 0.06 * reg - 0.16 * reg * reg) * (1 + 0.16 * (P[L.trade] - 0.5)) * demand
      * (1 - 0.1 * Math.max(0, tax - 0.45)) * (1 - 0.6 * W.strikeFrac - 1.2 * W.riotFrac) * (W.war ? 0.94 : 1) * (W.sanctions > 0 ? 0.95 : 1);
    let u = 0.045 + 0.16 * Math.max(0, P[L.wage] - 0.35) * (1 - sh.state) + 0.05 * reg * reg + 0.5 * Math.max(0, 1 - demand)
      - 0.06 * sh.state - 0.025 * sh.coop + 0.03 * Math.max(0, tax - 0.5);
    return { lam, E, uStar: clamp(u, 0.01, 0.45), effState: 1 - 0.35 * Math.pow(sh.state, 1.5), effCoop: 0.93 };
  }
  _shareTargets(P) {
    const state = P[L.state] * 0.95, small = (1 - state) * (0.12 + 0.6 * P[L.smallprop]);
    const coop = (1 - state - small) * P[L.coops] * 0.9;
    return { state, small, coop, big: Math.max(0, 1 - state - small - coop) };
  }

  _economy() {
    const P = this.P, sh = this.shares, cits = this.citizens, r = this.rng;
    const T = this._targets(P, sh);
    this.T = T;
    this.u += (T.uStar - this.u) * 0.15;

    // who has a job: the least skilled are laid off first, with some luck involved
    const workers = cits.filter(c => c.cls === 'worker' && !c.jailed);
    const wantEmployed = Math.round(workers.length * (1 - this.u));
    let emp = 0; for (const c of workers) if (c.employed) emp++;
    if (emp > wantEmployed) {
      const sorted = workers.filter(c => c.employed).sort((a, b) => a.skill * (0.6 + r()) - b.skill * (0.6 + r()));
      for (let k = 0; k < emp - wantEmployed; k++) sorted[k].employed = false;
    } else if (emp < wantEmployed) {
      const idle = workers.filter(c => !c.employed);
      for (let k = 0; k < wantEmployed - emp && idle.length; k++) idle.splice(Math.floor(r() * idle.length), 1)[0].employed = true;
    }

    const Y = this.A * T.E;                    // what one average worker produces this month
    const floor = P[L.wage] * 0.75 * Y;        // minimum wage
    const lamState = Math.max(T.lam, 0.72);
    let outBig = 0, outState = 0, outCoop = 0, outSmall = 0, wageBig = 0, wageState = 0;
    let nOwner = 0, wfOwner = 0, nOff = 0, nUnemp = 0, nRet = 0, wageSum = 0, nWage = 0;
    for (const c of cits) {
      c.gross = 0;
      if (c.jailed) continue;
      if (c.cls === 'worker' && c.employed) {
        const striking = c.action === 2;
        if (c.firm === 'big') { const o = Y * c.skill; outBig += o; c.gross = Math.max(floor, T.lam * o); wageBig += c.gross; }
        else if (c.firm === 'state') { const o = Y * c.skill * T.effState; outState += o; c.gross = Math.max(floor, lamState * o); wageState += c.gross; }
        else { const o = Y * c.skill * T.effCoop; outCoop += o; c.gross = o * 0.92; }
        if (striking) c.gross *= 0.3;          // strike pay
        wageSum += c.gross; nWage++;
      } else if (c.cls === 'small') {
        const harvest = REGIONS[c.region].kind === 'farmland' ? this.harvest || 1 : 1;
        const o = Y * 0.85 * Math.sqrt(c.wealthF) * harvest; outSmall += o; c.gross = o;
      } else if (c.cls === 'owner') { nOwner++; wfOwner += c.wealthF; }
      else if (c.cls === 'official') nOff++;
      else if (c.cls === 'retired') nRet++;
      else nUnemp++;
    }
    const profitBig = Math.max(0.03 * outBig, outBig - wageBig);
    const profitState = outState - wageState;
    const avgWage = nWage ? wageSum / nWage : Y * 0.6;
    const ownerPay = profitBig * 0.75;         // a quarter is reinvested
    // when lenders stop lending, the state can only pay what it collects
    const austerity = (this.austerity > 0 ? 0.75 : 1) * this.payFactor;
    const salary = avgWage * (0.85 + 0.45 * P[L.police]) * austerity;
    const benefit = (0.1 + 0.6 * P[L.welfare]) * avgWage * austerity;
    const pension = (0.15 + 0.6 * P[L.welfare]) * avgWage * austerity;
    for (const c of cits) {
      if (c.jailed) continue;
      if (c.cls === 'owner') c.gross = nOwner ? ownerPay * c.wealthF / wfOwner : 0;
      else if (c.cls === 'official') c.gross = c.action === 2 ? salary * 0.3 : salary;
      else if (c.cls === 'retired') c.gross = pension + Y * 0.05 * c.wealthF;   // pension plus a little savings
      else if (c.cls === 'worker' && !c.employed) c.gross = benefit;
    }
    // taxes: progressive, highest on big incomes
    let meanGross = 0; for (const c of cits) meanGross += c.gross; meanGross /= cits.length;
    const tax = P[L.tax];
    let revenue = profitState, spending = 0;
    for (const c of cits) {
      const rate = c.gross > 0 ? Math.min(0.8, tax * 0.6 * Math.pow(c.gross / meanGross, 0.35)) : 0;
      c.net = c.gross * (1 - rate);
      revenue += c.gross - c.net;
      if (c.jailed) continue;
      if (c.cls === 'official') spending += c.gross;
      else if (c.cls === 'retired') spending += pension;
      else if (c.cls === 'worker' && !c.employed) spending += benefit;
      c.incSmooth += (c.net - c.incSmooth) * (c.incSmooth ? 0.25 : 1);
    }
    const Ytot = outBig + outState + outCoop + outSmall;
    spending += this.debt * 0.03 / 12;          // interest
    if (this.war) spending += 0.06 * Ytot;      // fighting a war is expensive
    this.debt = Math.max(0, this.debt + spending - revenue);
    this.debtRatio = this.debt / Math.max(1, 12 * Ytot);
    this.budget = { revenue, spending };
    if (this.debtRatio > 0.9) this.payFactor = clamp(this.payFactor * Math.pow(clamp(revenue / Math.max(1, spending), 0.1, 2), 0.6), 0.3, 1);
    else this.payFactor = Math.min(1, this.payFactor + 0.01);
    this.Ytot = Ytot; this.gdpPP = Ytot * 12 / cits.length;
    this.yearOut = (this.yearOut || 0) + Ytot / cits.length; this.yearMonths = (this.yearMonths || 0) + 1;   // for a whole year's average
    this.avgWage = avgWage; this.meanIncome = cits.reduce((s, c) => s + c.net, 0) / cits.length;
    // people slowly get used to how well off everyone around them is
    if (this.REF) this.REF += (this.meanIncome - this.REF) * 0.003;

    // investment and ideas make next year more productive
    const invest = 0.25 * profitBig + 0.3 * Math.max(0, profitState) + 0.08 * outCoop;   // planners invest heavily
    const gA = 0.006 + 0.10 * invest / Math.max(1, Ytot) + 0.02 * (P[L.services] - 0.3) + 0.015 * (P[L.liberty] - 0.5)
      - 0.03 * this.C - 0.025 * clamp(this.debtRatio - 0.9, 0, 2) + 0.015 * (P[L.trade] - 0.5) - 0.012 * sh.state * sh.state;   // but plans adapt slowly
    // catching up: the further behind the world's best methods, the faster a country can copy them
    // (easier with open trade and free exchange of ideas)
    this.frontier = (this.frontier || 100) * (1 + 0.013 / 12);
    const catchUp = 0.02 * (0.3 + P[L.trade] + 0.5 * P[L.liberty]) * Math.max(0, Math.log(this.frontier / this.A));
    this.A *= 1 + (gA + catchUp) / 12;

    // inequality (Gini of take-home pay), every 3 months
    if (this.month % 3 === 0) {
      const xs = cits.map(c => c.net).sort((a, b) => a - b);
      let s = 0, sw = 0; for (let i = 0; i < xs.length; i++) { s += xs[i]; sw += (i + 1) * xs[i]; }
      this.gini = s > 0 ? (2 * sw) / (xs.length * s) - (xs.length + 1) / xs.length : 0;
    }
    // crime, per region
    const unemp = new Float32Array(NR), wk = new Float32Array(NR), poor = new Float32Array(NR), pop = new Float32Array(NR);
    for (const c of cits) {
      pop[c.region]++;
      if (c.cls === 'worker') { wk[c.region]++; if (!c.employed) unemp[c.region]++; }
      if (c.needs[0] < 0.3) poor[c.region]++;
    }
    for (let k = 0; k < NR; k++) {
      const ur = wk[k] ? unemp[k] / wk[k] : 0;
      this.crime[k] = clamp(0.02 + 0.35 * this.gini + 0.5 * ur + 0.15 * poor[k] / Math.max(1, pop[k]) - 0.18 * P[L.police] - 0.06 * P[L.welfare], 0, 0.7);
    }

    // world economy and weather
    this.g = 1 + 0.97 * (this.g - 1) + 0.007 * r.gauss();
    if (r() < 0.0025) { this.g -= 0.08; this.log('A slump in the wider world: trade dries up and orders fall.', 'economy'); }
    if (this.month % 12 === 0) {
      this.harvest = r() < 0.06 ? 0.65 : 1 + r.gauss() * 0.05;
      if (this.harvest < 0.8) this.log('A bad harvest hits the farms of Redfield.', 'disaster');
    }
    // debt crisis: lenders panic when debt gets too big
    if (this.austerity > 0) this.austerity--;
    else if (this.debtRatio > 0.9 && r() < 0.02 * (this.debtRatio - 0.8) * 10) {
      this.austerity = 24; this.A *= 0.98; this.debt *= 0.5; this.g -= 0.05;
      this.log(`Debt crisis! Debt reached ${Math.round(this.debtRatio * 100)}% of a year's output. Lenders panic; pay, pensions and benefits are cut for two years.`, 'crisis');
    }
    // lenders' conditions: while debt is dangerously high, taxes must rise and spending must fall
    if (this.debtRatio > 0.9) {
      const d = this.ideology;
      if (!this.creditorRule) this.log('Lenders will only keep lending if taxes go up and spending comes down. The government has no choice.', 'economy');
      this.creditorRule = true;
      P[L.tax] = Math.min(d.hi[L.tax], P[L.tax] + 0.01);
      P[L.welfare] = Math.max(d.lo[L.welfare], P[L.welfare] - 0.004);
      P[L.police] = Math.max(d.lo[L.police], P[L.police] - 0.002);
      this.target[L.tax] = Math.max(this.target[L.tax], P[L.tax]);
      this.taxFloor = { level: P[L.tax], until: this.month + 60 };   // and taxes may not fall back for five years
    } else if (this.debtRatio < 0.6) this.creditorRule = false;
    if (this.taxFloor && this.month < this.taxFloor.until) P[L.tax] = Math.max(P[L.tax], Math.min(this.ideology.hi[L.tax], this.taxFloor.level));
    // ownership slowly follows the laws (nationalising, breaking up estates, founding co-ops)
    const st = this._shareTargets(P);
    for (const k in st) sh[k] += (st[k] - sh[k]) * 0.004;
    this.C *= 1 - 0.01 * (0.6 + P[L.liberty]);
    this.strikeBoost = this.strikeBoost * 0.85 + 0.12 * this.strikeFrac;
  }

  /* ---------------- how a citizen feels ---------------- */
  /** Needs on a 0..1 scale and overall satisfaction. snap lets the experts forecast. */
  _feel(c, snap) {
    const P = snap ? snap.P : this.P, n = c.needs;
    const net = snap ? snap.net(c) : c.incSmooth || c.net;
    const REF = this.REF || this.meanIncome || 50;
    const crime = snap ? snap.crime : this.crime[c.region];
    const gini = snap ? snap.gini : this.gini;
    const employed = snap ? true : c.employed;
    const jailed = !snap && c.jailed > 0;
    n[0] = clamp(1 - Math.exp(-net / REF) - (snap ? 0 : 0.3 * this.hurt[c.region]), 0, 1);
    const pollution = (1 - P[L.regulation]) * REGIONS[c.region].industry * 0.5;
    n[1] = clamp(0.2 + 0.45 * P[L.services] + 0.25 * n[0] - pollution, 0, 1);
    const war = !snap && this.war ? 0.15 + 0.15 * Math.max(0, -this.war.score) : 0;   // bombs, shortages, fear of losing
    const hurt = snap ? 0 : this.hurt[c.region];                     // a recent disaster here: loss, fear, rebuilding
    n[2] = clamp(1 - crime * 1.5 - war - 0.6 * hurt, 0, 1);
    n[3] = jailed ? 0 : clamp(Math.pow(P[L.liberty], 0.7) - 0.3 * P[L.police] * (1 - P[L.liberty]), 0, 1);
    n[4] = clamp(1 - gini * 1.3 - 0.6 * (snap ? snap.C : this.C), 0, 1);
    let d;
    if (jailed) d = 0;
    else if (c.cls === 'worker') d = employed ? 0.3 + 0.3 * P[L.unions] + 0.2 * P[L.wage] + (c.firm === 'coop' ? 0.25 : 0) : 0.1 + 0.2 * P[L.welfare];
    else if (c.cls === 'small') d = 0.8; else if (c.cls === 'owner') d = 0.85; else if (c.cls === 'official') d = 0.7; else d = 0.6;
    n[5] = clamp(d, 0, 1);
    let s = 0, v = 0; for (let k = 0; k < NN; k++) { s += c.values[k] * n[k]; v += c.values[k]; }
    return s / v;
  }

  /** What a citizen expects from a set of laws, using only what they have learned.
      Big sudden changes feel risky (caution), so the most appealing promise is a measured step. */
  expect(c, platform, caution = CAUTION) {
    let s = 0;
    for (let p = 0; p < NP; p++) { const d = platform[p] - this.P[p]; s += c.w[p] * d - caution * d * d; }
    return s;
  }
  /** How much a citizen would like each system of government. */
  judgeSystems(c, out) {
    const sNow = c.sRef;
    for (let k = 0; k < NI; k++) {
      const known = !Number.isNaN(c.memory[k]);
      // a system they have never lived under is a leap in the dark
      if (k === this.regime) out[k] = 0.04 + (known ? 2 * (c.memory[k] - sNow) : 0);
      else out[k] = HOPE * this.expect(c, IDEOLOGIES[k].typical, 0.01) + (known ? 5 * (c.memory[k] - sNow) : -0.15);
    }
    return out;
  }

  _features(c, local, rep, out) {
    out[0] = 1; out[1] = 0.5 - c.s; out[2] = local; out[3] = rep;
    out[4] = c.fav !== this.regime ? clamp(c.favScore, 0, 1) : 0;
    return out;
  }
  _q(c, f, a) { let v = 0; for (let k = 0; k < NF; k++) v += c.q[a * NF + k] * f[k]; return v; }
  /** One step of learning: nudge the weights of the action taken toward what it turned out to be worth. */
  _learnAction(c, a, reward, nextF) {
    let mx = 0;
    if (nextF) { mx = -Infinity; for (let b = 0; b < NA; b++) mx = Math.max(mx, this._q(c, nextF, b)); }
    const delta = reward + 0.8 * mx - this._q(c, c.feat, a);
    for (let k = 0; k < NF; k++) c.q[a * NF + k] = clamp(c.q[a * NF + k] + 0.05 * delta * c.feat[k], -3, 3);
  }

  _citizens() {
    const r = this.rng, P = this.P, cits = this.citizens;
    const rep = P[L.police] * (1 - P[L.liberty]);
    const regAct = new Float32Array(NR), regSame = Array.from({ length: NR }, () => new Float32Array(NA)), regPop = new Float32Array(NR);
    for (const c of cits) { regPop[c.region]++; regSame[c.region][c.action]++; if (c.action) regAct[c.region]++; }
    const judge = new Float32Array(NI), feat = new Float32Array(NF);
    const hist = this.Phist, Pold = hist.length >= 12 ? hist[hist.length - 12] : null;
    // what changed in a year: every law, and whether we are at war
    let dP2 = 0; const dP = new Float32Array(NW);
    if (Pold) for (let p = 0; p < NW; p++) { dP[p] = (p < NP ? P[p] : this.war ? 1 : 0) - Pold[p]; dP2 += dP[p] * dP[p]; }
    const propaganda = 0.15 * (1 - P[L.liberty]) * P[L.police];
    let sumS = 0;

    for (const c of cits) {
      const sPrev = c.s;
      c.s = this._feel(c);
      sumS += c.s;
      // ----- beliefs about laws: compare life now with a year ago, against how the laws changed
      const sYearAgo = c.sHist[this.month % 12];
      // (trend: "life just keeps getting better/worse", so not every law that rose gets the credit)
      if (Pold && dP2 > 4e-4) {
        let pred = c.trend; for (let p = 0; p < NW; p++) pred += c.w[p] * dP[p];
        const err = (c.s - sYearAgo) - pred;
        const lr = 0.1 / (dP2 + 0.02 + 0.01);
        for (let p = 0; p < NW; p++) c.w[p] = clamp(c.w[p] + lr * err * dP[p], -3, 3);
        c.trend += lr * err * 0.01;
      }
      c.sHist[this.month % 12] = c.s;
      c.sRef += (c.s - c.sRef) * 0.05;
      // ----- memory of this system of government (state media make it sound better than it is)
      const m = c.memory[this.regime];
      c.memory[this.regime] = Number.isNaN(m) ? c.sRef : m + (c.s + propaganda - m) * 0.015;
      // ----- trust: how is life going while each party governs?
      for (const party of this.parties) {
        let t = c.trust[party.id] || 0;
        if (party.govShare > 0) t += 4 * (c.s - sPrev) * party.govShare - 0.003 * party.govShare;   // governing wears a party out
        c.trust[party.id] = clamp(t * 0.99, -1, 1);
      }
      // ----- which system they would choose
      this.judgeSystems(c, judge);
      c.judge.set(judge);
      let fav = this.regime, best = judge[this.regime];
      for (let k = 0; k < NI; k++) if (judge[k] > best) { best = judge[k]; fav = k; }
      c.fav = fav; c.favScore = best - judge[this.regime];
      // ----- what to do this month: learn from what happened after last month's choice
      const local = regAct[c.region] / Math.max(1, regPop[c.region]);
      const f = this._features(c, local, rep, feat);
      if (c.jailed) { c.jailed--; c.action = 0; c.feat.set(f); continue; }
      const a = c.action;
      if (this.month > 0 && !c._arrested) {
        const same = a ? regSame[c.region][a] / Math.max(1, regPop[c.region]) : 0;
        // reward: did life get better? Acting also answers anger, solidarity and ideals (fighting for a system they believe in)
        // (taking up arms feels far less justified where people can speak freely and change things peacefully)
        const ideal = c.fav !== this.regime ? IDEALS[a] * clamp(c.favScore, 0, 1) * (a === 3 ? 1 - 0.75 * P[L.liberty] : 1) : 0;
        let reward = 8 * (c.s - sPrev) + (a ? 0.6 * (0.45 - c.s) + 0.15 * same - ACTION_COST[a] + ideal : 0);
        this._learnAction(c, a, reward, f);
      }
      c._arrested = false;
      let choice = 0;
      if (r() < 0.03) choice = Math.floor(r() * NA);
      else { let mx = -Infinity; for (let b = 0; b < NA; b++) { const v = this._q(c, f, b); if (v > mx) { mx = v; choice = b; } } }
      if (choice === 2 && !((c.cls === 'worker' && c.employed) || c.cls === 'official')) choice = 1;   // only people with a job can strike
      c.action = choice; c.feat.set(f);
      // ----- talk with a neighbour, most often someone like themselves
      if (r() < 0.15) {
        const o = cits[Math.floor(r() * cits.length)];
        if (o !== c && o.region === c.region) {
          const k = o.cls === c.cls ? 0.02 : 0.005;
          for (let p = 0; p < NW; p++) c.w[p] += k * (o.w[p] - c.w[p]);
          c.abroad += k * (o.abroad - c.abroad);
          for (let j = 0; j < NI; j++) if (Number.isNaN(c.memory[j]) && !Number.isNaN(o.memory[j]) && r() < 0.3) c.memory[j] = o.memory[j];
        }
      }
    }
    this.meanS = sumS / cits.length;
  }

  /* ---------------- unrest and revolution ---------------- */
  _unrest() {
    const r = this.rng, P = this.P, cits = this.citizens;
    const rep = P[L.police] * (1 - P[L.liberty]);
    let protest = 0, strike = 0, riot = 0, workers = 0;
    let attack = 0, defence = 0;
    const want = new Float32Array(NI);
    const force = 3 * (0.4 + P[L.police]) * (this.succession > 0 ? 0.7 : 1);   // what one armed official is worth (less while rulers fight over succession)
    const legit = 0.08 * (0.5 + P[L.liberty]);   // loyalty counts for more where people are free to speak and choose
    let offRebels = 0, offTotal = 0, civRebels = 0;
    for (const c of cits) {
      if (c.cls === 'worker' && c.employed) workers++;
      if (c.cls === 'official') offTotal++;
      if (c.jailed) continue;
      const wantsChange = c.fav !== this.regime;
      if (c.action === 1) protest++; else if (c.action === 2) strike++; else if (c.action === 3) riot++;
      if (wantsChange && c.action) {
        // fighters count most; a general strike and a huge peaceful crowd count too
        const wgt = c.action === 3 ? (c.cls === 'official' ? force : 1) : c.action === 2 ? 0.4 : 0.25;
        attack += wgt; want[c.fav] += wgt;
        if (c.action === 3) { if (c.cls === 'official') offRebels++; else civRebels++; }
      } else if (c.cls === 'official') defence += force * (0.3 + c.s);
      else if (!c.action && !wantsChange) defence += legit * (c.s > 0.55 ? 2 : 1);   // people content with the system stand by it
    }
    // a new order's own fighters defend it hard for two years, then less and less until year four
    const young = this.month - this.regimeSince;
    if (this.regimeLog.length > 1 && young < 48) defence += cits.length * 0.6 * Math.min(1, 2 - young / 24);
    const n = cits.length;
    this.protestFrac = protest / n; this.strikeFrac = strike / Math.max(1, workers); this.riotFrac = riot / n;
    this.attack = attack; this.defence = defence;

    // arrests, where the police are strong and freedom weak
    let arrested = 0;
    const failing = attack < defence;
    if (rep > 0.02) for (const c of cits) {
      if (!c.action || c.jailed) continue;
      const p = rep * (c.action === 1 ? 0.05 : c.action === 2 ? 0.08 : failing ? 0.3 : 0.05);
      if (r() < p) { this._learnAction(c, c.action, -0.8, null); c.jailed = 6 + Math.floor(r() * 13); c.action = 0; c._arrested = true; c.arrests++; arrested++; }
    }
    if (arrested >= 8) this.log(`Police arrest ${arrested} people at protests and strikes.`, 'repress');

    const street = (riot + strike + protest * 0.5) / n;
    this.revoltRun = street > 0.06 && attack > defence ? (this.revoltRun || 0) + 1 : 0;
    if (this.revoltRun >= 3) {
      this.revoltRun = 0;
      let to = 0; for (let k = 0; k < NI; k++) if (k !== this.regime && want[k] > want[to]) to = k;
      if (to === this.regime) to = (to + 1) % NI;
      const coup = offRebels > civRebels * 0.5 && offRebels >= offTotal * 0.3;
      const pct = Math.round(100 * riot / n), offPct = Math.round(100 * offRebels / Math.max(1, offTotal));
      this.log(`${coup ? 'Coup!' : 'Revolution!'} ${pct}% of citizens rose up${offRebels ? `, joined by ${offPct}% of police and soldiers` : ''}. The ${IDEOLOGIES[this.regime].name} falls. The rebels want ${IDEOLOGIES[to].name}.`, 'revolution');
      for (const c of cits) if (c.action === 3) c.revolutions++;
      this._changeRegime(to, coup ? 'coup' : 'revolution');
    } else if (failing && riot >= n * 0.03 && this.month - (this.lastFailLog || -99) >= (riot >= n * 0.06 ? 12 : 60)) {
      this.lastFailLog = this.month;
      this.log(`An uprising of ${riot} people fails: ${Math.round(defence)} strength defends the government against ${Math.round(attack)}.`, 'repress');
    }
  }

  _changeRegime(to, how) {
    const from = this.regime, d = IDEOLOGIES[to];
    this.regime = to; this.regimeSince = this.month;
    this.regimeLog.push({ month: this.month, regime: to, how });
    // the new order forces its core laws at once
    for (let p = 0; p < NP; p++) {
      const v = clamp(this.P[p], d.lo[p], d.hi[p]);
      this.P[p] = v === this.P[p] ? v : (v + d.typical[p]) / 2;
      this.P[p] = clamp(this.P[p], d.lo[p], d.hi[p]);
    }
    this.target.set(this.P);
    if (how !== 'vote') {
      // property is seized or handed out; the turmoil costs output
      const st = this._shareTargets(this.P);
      for (const k in st) this.shares[k] += (st[k] - this.shares[k]) * 0.5;
      this.A *= 0.92; this.u = Math.min(0.4, this.u + 0.06); this.debt *= 0.5;
      // the old police who fought the rebels are purged; the new order arms its own supporters
      const rebels = this.citizens.filter(c => c.action === 3 && c.fav === to && c.cls !== 'official' && c.cls !== 'retired');
      for (const c of this.citizens) if (c.cls === 'official' && c.action !== 3 && this.rng() < 0.7) {
        c.cls = 'worker'; c.employed = false;
        const rc = rebels.splice(Math.floor(this.rng() * rebels.length), 1)[0];
        if (rc) rc.cls = 'official';
      }
      for (const c of this.citizens) { c.action = 0; c.jailed = 0; }
    } else if (how === 'reform') {
      // a peaceful change: property is reformed gradually, prisoners are freed, little is destroyed
      const st = this._shareTargets(this.P);
      for (const k in st) this.shares[k] += (st[k] - this.shares[k]) * 0.2;
      this.A *= 0.98;
      for (const c of this.citizens) c.jailed = 0;
    }
    this.amendment = null; this.directRun = null; this.pactRun = null;
    this._reconcileClasses(false);
    for (const party of this.parties) party.govShare = 0;
    if (d.rule === 'elections') {
      if (IDEOLOGIES[from].rule !== 'elections' || !this.parties.length) {
        this.deadParties.push(...this.parties); this.parties = [];
        for (let k = 0; k < 4; k++) this._foundParty(null);
        this.log('Parties are allowed again. New ones form; nobody knows yet which promises win.', 'party');
      }
      this.faction = null;
      this.nextElection = this.month + 6;
      this._formCaretaker();
    } else {
      if (this.parties.length) { this.deadParties.push(...this.parties); this.parties = []; this.log('All parties are banned.', 'repress'); }
      this.faction = d.faction ? this._newFaction(d) : null;
      this.nextElection = Infinity;
    }
  }

  /* ---------------- brains: parties and ruling factions ---------------- */
  _inputs(own, inGov) {
    const x = new Float32Array(BRAIN_SIZES[0]);
    let crime = 0; for (let k = 0; k < NR; k++) crime += this.crime[k] / NR;
    x[0] = this.u * 5 - 0.5; x[1] = this.gini * 3 - 1; x[2] = clamp(this.growth * 30, -2, 2); x[3] = crime * 3 - 0.5;
    x[4] = clamp(this.debtRatio - 0.6, -1, 2); x[5] = (this.protestFrac + this.strikeFrac + this.riotFrac) * 4;
    x[6] = this.meanS * 4 - 2; x[7] = own * 3 - 0.5; x[8] = inGov ? 1 : -1;
    x[9] = Number.isFinite(this.nextElection) ? clamp(1 - (this.nextElection - this.month) / 24, -1, 1) : 0;
    x[10] = this.war ? 1 : -1; x[11] = this.war ? this.war.score : 0;
    return x;
  }
  _platform(params, inputs) {
    const net = this._net || (this._net = new Network(BRAIN_SIZES));
    net.params.set(params);
    const o = net.forward(inputs), d = this.ideology, out = new Float32Array(NP + 2);
    for (let p = 0; p < NP; p++) out[p] = clamp((o[p] + 1) / 2, d.lo[p], d.hi[p]);
    out[OUT_CHANGE] = (o[OUT_CHANGE] + 1) / 2; out[OUT_WAR] = (o[OUT_WAR] + 1) / 2;
    return out;
  }
  /** The system a set of promises comes closest to (other than the one in power). */
  aimOf(plat) {
    if (plat._aimFor === this.regime) return plat._aim;
    let best = -1, bd = Infinity;
    for (let k = 0; k < NI; k++) {
      if (k === this.regime) continue;
      let dd = 0; for (let p = 0; p < NP; p++) dd += (plat[p] - IDEOLOGIES[k].typical[p]) ** 2;
      if (dd < bd) { bd = dd; best = k; }
    }
    plat._aimFor = this.regime; plat._aim = best;
    return best;
  }
  pushesChange(plat) { return plat[OUT_CHANGE] > 0.7; }
  wantsWar(plat) { return plat[OUT_WAR] > 0.7; }
  _freshBrain(ideal) {
    const net = Network.random(BRAIN_SIZES, this.rng);
    const params = net.params;
    for (let i = 0; i < params.length; i++) params[i] *= 0.4;
    if (ideal) {   // founders give the party a starting direction, not a strategy
      const n0 = BRAIN_SIZES[0], n1 = BRAIN_SIZES[1], base = n1 * (n0 + 1);
      for (let j = 0; j < NP; j++) params[base + j * (n1 + 1) + n1] = Math.atanh(clamp(2 * ideal[j] - 1, -0.95, 0.95));
    }
    // the two big choices start leaning "no"
    const n0 = BRAIN_SIZES[0], n1 = BRAIN_SIZES[1], base = n1 * (n0 + 1);
    for (const j of [OUT_CHANGE, OUT_WAR]) params[base + j * (n1 + 1) + n1] = -0.6;
    return params;
  }
  _mutate(params, sigma) {
    const g = Float32Array.from(params);
    for (let i = 0; i < g.length; i++) if (this.rng() < 0.4) g[i] += this.rng.gauss() * sigma;
    return g;
  }

  _foundParty(ideal, region = null) {
    if (this.parties.length >= 8) return null;
    const r = this.rng;
    const used = new Set(this.parties.map(p => p.color));
    let color = PARTY_COLORS.find(c => !used.has(c)) || PARTY_COLORS[this.partyCount % 8];
    let name;
    for (let tries = 0; tries < 20; tries++) {
      name = region != null ? `${REGIONS[region].name} ${['League', 'First', 'Movement', 'Union', 'Alliance', 'Party'][Math.floor(r() * 6)]}`
        : (r() < 0.25 ? 'The ' : '') + PARTY_A[Math.floor(r() * PARTY_A.length)] + ' ' + PARTY_B[Math.floor(r() * PARTY_B.length)];
      if (![...this.parties, ...this.deadParties].some(p => p.name === name)) break;
    }
    const brain = this._freshBrain(ideal);
    const party = {
      id: 'p' + (++this.partyCount), name, color, founded: this.month, brain,
      pool: [brain, ...Array.from({ length: 5 }, () => this._mutate(brain, 0.15))], poolScores: [],
      platform: this._platform(brain, this._inputs(0.2, false)), seats: 0, votes: 0, share: 0, govShare: 0, money: 0,
      generation: 0, history: [], weak: -1, conscience: new Float32Array(3 * 2), decisions: [], lastShare: 0, scandals: 0, bribes: 0,
      donors: {}, region,   // region: a regional party only stands in its home region
      leader: this._newLeader(),
    };
    party.family = familyOf(party.platform);
    for (const c of this.citizens) c.trust[party.id] = r.gauss() * 0.1;
    this.parties.push(party);
    return party;
  }

  /** A named leader: charisma helps win votes; leaders age, resign, have scandals, and die. */
  _newLeader(minAge = 38) {
    const r = this.rng;
    return {
      name: SYL1[Math.floor(r() * SYL1.length)] + SYL2[Math.floor(r() * SYL2.length)] + ' ' + SUR1[Math.floor(r() * SUR1.length)] + SUR2[Math.floor(r() * SUR2.length)],
      age: minAge + r() * 22, charisma: clamp(r.gauss() * 0.5, -1, 1), since: this.month,
    };
  }
  _newFaction(d) {
    const brain = this._freshBrain(d.typical);
    return {
      name: d.faction, ideology: d.id, brain, pool: [brain, ...Array.from({ length: 5 }, () => this._mutate(brain, 0.15))], poolScores: [],
      platform: this._platform(brain, this._inputs(0.5, true)), generation: 0, approval: 0.5, history: [],
      conscience: new Float32Array(3 * 2), decisions: [], lastApproval: 0.5, money: 0, scandals: 0, bribes: 0, since: this.month,
      leader: this._newLeader(45),
    };
  }

  /** Before the first election, laws drift on as they were. */
  _formCaretaker() { this.government = { parties: [], caretaker: true }; }

  /* ---------------- polls and elections ---------------- */
  _utility(c, party, platform) {
    if (party.region != null && party.region !== c.region) return -Infinity;   // not on the ballot here
    let u = HOPE * this.expect(c, platform) + 0.6 * (c.trust[party.id] || 0) + (c.lastVote === party.id ? 0.15 : 0);
    if (party.leader) u += 0.25 * party.leader.charisma;                      // a likeable (or awful) leader
    u += 0.3 * taste(c.id, party.id);                                          // personal taste: a candidate they like, a family habit
    if (party.region != null) u += 0.25;                                       // "one of us"
    // campaigning to change the whole system: welcome to those who want that system, alarming to the rest
    if (this.pushesChange(platform)) u += 0.5 * clamp(c.judge[this.aimOf(platform)] - c.judge[this.regime], -1, 1);
    return u + HOPE * this.warAppeal(c, platform);
  }
  /** War or peace, judged by what a citizen has learned about war (starting one feels risky). */
  warAppeal(c, plat) {
    const dWar = (this.wantsWar(plat) ? 1 : 0) - (this.war ? 1 : 0);
    return dWar ? c.w[W_WAR] * dWar - (dWar > 0 ? 0.08 : 0) : 0;
  }
  _poll(sample, platforms) {
    const counts = new Float32Array(this.parties.length);
    for (const c of sample) {
      let best = -1, bu = -Infinity;
      for (let k = 0; k < this.parties.length; k++) {
        const u = this._utility(c, this.parties[k], platforms[k]);
        if (u > bu) { bu = u; best = k; }
      }
      if (best >= 0) counts[best]++;
    }
    for (let k = 0; k < counts.length; k++) counts[k] /= Math.max(1, sample.length);
    return counts;
  }
  _sample(n, region = null) {
    const cits = region == null ? this.citizens : this.citizens.filter(c => c.region === region), out = [];
    for (let i = 0; i < n && cits.length; i++) out.push(cits[Math.floor(this.rng() * cits.length)]);
    return out;
  }
  /** Monthly opinion poll (what people would vote for today), for the page. */
  _voteIntents() {
    if (!this.parties.length) { for (const c of this.citizens) c.voteIntent = null; return; }
    const shares = new Float32Array(this.parties.length);
    for (const c of this.citizens) {
      let best = -1, bu = -Infinity;
      for (let k = 0; k < this.parties.length; k++) {
        const u = this._utility(c, this.parties[k], this.parties[k].platform);
        if (u > bu) { bu = u; best = k; }
      }
      c.voteIntent = best >= 0 ? this.parties[best].id : null;
      if (best >= 0) shares[best]++;
    }
    this.parties.forEach((p, k) => { p.poll = shares[k] / this.citizens.length; });
  }

  _election(snap) {
    const r = this.rng;
    // 1. citizens nobody speaks for may found a party
    this._maybeFoundParty();
    const national = this._sample(160);
    const platformsNow = this.parties.map(p => p.platform);
    // 2. primaries: each party's candidates are tested in a poll; the best one leads
    for (let k = 0; k < this.parties.length; k++) {
      const party = this.parties[k];
      const inputs = this._inputs(party.share, party.govShare > 0);
      const members = this.citizens.filter(c => c.lastVote === party.id);
      const msample = members.length > 60 ? members.slice(0, 60) : members;
      const sample = party.region != null ? this._sample(160, party.region) : national;   // regional parties poll at home
      party.poolScores = party.pool.map(params => {
        const plat = this._platform(params, inputs);
        const plats = platformsNow.slice(); plats[k] = plat;
        const share = this._poll(sample, plats)[k];
        let approve = 0; for (const c of msample) approve += sig(6 * this.expect(c, plat));
        approve = msample.length ? approve / msample.length : 0.5;
        let donor = 0;
        for (const id in party.donors) { const l = this.lobbies.find(x => x.id === id); if (l) donor += party.donors[id] * l.dir * (plat[l.top] - this.P[l.top]); }
        return share + 0.3 * approve + 0.2 * clamp(donor, -1, 1);
      });
      let bi = 0; party.poolScores.forEach((s, i) => { if (s > party.poolScores[bi]) bi = i; });
      party.brain = party.pool[bi];
      party.platform = this._platform(party.brain, inputs);
      party.family = familyOf(party.platform);
      platformsNow[k] = party.platform;
      party.bestCandidate = bi;
    }
    // 3. campaign: money buys adverts, adverts buy trust and persuade
    const money = this.parties.reduce((s, p) => s + p.money, 0);
    if (money > 0) for (const c of this.citizens) {
      if (r() > 0.5) continue;
      for (const party of this.parties) {
        const m = party.money / money;
        if (m <= 0) continue;
        c.trust[party.id] = clamp((c.trust[party.id] || 0) + 0.25 * m, -1, 1);
        for (let p = 0; p < NP; p++) c.w[p] += 0.03 * m * (party.platform[p] - this.P[p]);
      }
    }
    // 4. voting day
    const votes = new Float32Array(this.parties.length), regTurnout = new Float32Array(NR);
    let turnout = 0;
    for (const c of this.citizens) {
      if (c.jailed) continue;
      let best = -1, bu = -Infinity, second = -Infinity;
      for (let k = 0; k < this.parties.length; k++) {
        const u = this._utility(c, this.parties[k], this.parties[k].platform) + r.gauss() * 0.1;
        if (u > bu) { second = bu; bu = u; best = k; } else if (u > second) second = u;
      }
      const care = 0.45 + clamp(bu - second, 0, 0.4) + 0.15 * c.age / 90;
      if (best < 0 || r() > care) continue;
      votes[best]++; turnout++; regTurnout[c.region]++; c.lastVote = this.parties[best].id;
    }
    // 5. seats (largest averages, 101 seats, 4% threshold; a regional party with 20% at home gets in anyway)
    const shares = Array.from(votes, v => v / Math.max(1, turnout));
    const seats = new Int32Array(this.parties.length);
    const inParl = this.parties.map((p, k) => shares[k] >= 0.04 || (p.region != null && votes[k] / Math.max(1, regTurnout[p.region]) >= 0.2));
    for (let s = 0; s < 101; s++) {
      let bk = -1, bq = -1;
      for (let k = 0; k < votes.length; k++) if (inParl[k]) { const q = votes[k] / (seats[k] + 1); if (q > bq) { bq = q; bk = k; } }
      if (bk < 0) break; seats[bk]++;
    }
    this.parties.forEach((p, k) => {
      p.lastShare = p.share; p.share = shares[k]; p.seats = seats[k]; p.votes = votes[k];
      p.homeShare = p.region != null ? votes[k] / Math.max(1, regTurnout[p.region]) : null;
      p.history.push([this.month, shares[k], seats[k]]);
    });
    // 6. coalition: biggest party gathers the closest partners until it has a majority
    const wasGov = new Set(this.government ? this.government.parties : []);
    const gov = this._formGovernment([]);
    const names = gov.map(p => `${p.name} (${p.seats})`).join(' + ');
    this.elections.push({ month: this.month, turnout: turnout / this.citizens.length, results: this.parties.map((p, k) => ({ id: p.id, name: p.name, color: p.color, share: shares[k], seats: seats[k] })), gov: this.government.parties.slice() });
    this.log(`Election: ${Math.round(100 * turnout / this.citizens.length)}% turnout. ${gov.length > 1 ? 'Coalition' : 'Government'}: ${names}.`, 'election');
    // 7. evolution: keep the winning candidate, try variations, borrow from rivals
    for (const party of this.parties) {
      // a bad result, or losing power, often costs the leader their job
      const lost = wasGov.has(party.id) && party.govShare === 0;
      if (party.lastShare > 0.05 && (party.share < 0.7 * party.lastShare || lost) && r() < 0.45) this._replaceLeader(party, `resigns as leader of ${party.name} after ${lost ? 'losing power' : 'a bad result'}`);
      const rival = this.parties[Math.floor(r() * this.parties.length)];
      const kids = [party.brain];
      for (let i = 0; i < 4; i++) kids.push(this._mutate(party.brain, 0.12 + 0.1 * r()));
      const mix = Float32Array.from(party.brain);
      for (let i = 0; i < mix.length; i++) if (r() < 0.5) mix[i] = rival.brain[i];
      kids.push(this._mutate(mix, 0.05));
      party.pool = kids; party.generation++;
      // learning about bribes: did taking (or refusing) them pay off in votes?
      const delta = (party.share - party.lastShare) * 10;
      for (const d of party.decisions) party.conscience[d.s * 2 + d.a] += 0.25 * (delta - party.conscience[d.s * 2 + d.a]);
      party.decisions = [];
      party.money = 0; party.donors = {};
      party.weak = party.share < 0.03 ? party.weak + 1 : 0;
    }
    // 8. parties nobody votes for twice in a row fold
    for (const party of this.parties.filter(p => p.weak >= 2 && this.parties.length > 2)) {
      this.parties.splice(this.parties.indexOf(party), 1); this.deadParties.push(party);
      this.log(`${party.name} folds after two elections below 3%.`, 'party');
    }
    // 8b. big parties whose own voters feel abandoned may split; small, similar ones may merge
    this._maybeSplit();
    this._maybeMerge();
    this.nextElection = this.month + 48;
    // 9. war or peace, if the new government wants it
    this._warPolicy();
    // 10. changing the system itself
    this._constitution();
  }

  /** The biggest party gathers the parties closest to it until it has a majority (or governs as a minority). */
  _formGovernment(exclude) {
    const cands = this.parties.filter(p => p.seats > 0 && !exclude.includes(p.id)).sort((a, b) => b.seats - a.seats);
    for (const p of this.parties) p.govShare = 0;
    if (!cands.length) { this._formCaretaker(); return []; }
    const lead = cands[0];
    const dist = q => { let d = 0; for (let k = 0; k < NP; k++) d += (q.platform[k] - lead.platform[k]) ** 2; return d; };
    const rest = cands.slice(1).sort((a, b) => dist(a) - dist(b));
    const gov = [lead]; let have = lead.seats;
    while (have < 51 && rest.length) { const q = rest.shift(); gov.push(q); have += q.seats; }
    const target = new Float32Array(NP);
    for (const q of gov) { q.govShare = q.seats / Math.max(1, have); for (let k = 0; k < NP; k++) target[k] += q.platform[k] * q.govShare; }
    this.target = target;
    this.government = { parties: gov.map(q => q.id), caretaker: false, since: this.month, seats: have };
    return gov;
  }

  /** Coalitions can fall apart between elections: after a scandal, or when a partner's support is collapsing. */
  _coalitionCheck() {
    const g = this.government;
    if (this.ideology.rule !== 'elections' || !g || g.caretaker || g.parties.length < 2 || this.month - g.since < 6) return;
    const gov = this.parties.filter(p => g.parties.includes(p.id));
    const lead = gov.slice().sort((a, b) => b.seats - a.seats)[0];
    for (const p of gov) {
      if (p === lead) continue;
      const scandal = this.lastScandal && this.lastScandal.party === lead.id && this.month - this.lastScandal.month <= 2;
      const risk = 0.002 + (p.poll < 0.6 * p.share ? 0.012 : 0) + (scandal ? 0.12 : 0);
      if (this.rng() > risk) continue;
      const why = scandal ? `over the scandal around ${lead.name}` : 'as its support collapses';
      const before = this.government.parties.length;
      const rest = this._formGovernment([p.id]);
      const have = rest.reduce((t, q) => t + q.seats, 0);
      if (have >= 51) this.log(`${p.name} walks out of the government ${why}. ${rest.map(q => q.name).join(' + ')} ${rest.length > before - 1 ? 'form a new coalition' : 'carry on'} with ${have} seats.`, 'politics');
      else if (this.rng() < 0.4) this.log(`${p.name} walks out of the government ${why}. ${lead.name} carries on as a minority government (${have} seats).`, 'politics');
      else {
        this.log(`${p.name} walks out of the government ${why}. It loses its majority and a snap election is called.`, 'politics');
        this.nextElection = Math.min(this.nextElection, this.month + 2);
      }
      return;
    }
  }

  _replaceLeader(holder, why) {
    const old = holder.leader;
    holder.leader = this._newLeader(holder === this.faction ? 45 : 38);
    this.log(`${old.name} ${why}. ${holder.leader.name} takes over.`, 'leader');
  }
  /** Leaders age and die; dictators' deaths start a succession struggle; personal scandals end careers. */
  _leaders() {
    const r = this.rng, all = this.parties.slice();
    if (this.faction) all.push(this.faction);
    if (this.succession > 0) this.succession--;
    for (const h of all) {
      if (!h.leader) h.leader = this._newLeader();
      const L0 = h.leader;
      L0.age += 1 / 12;
      const pDie = L0.age < 60 ? 0.0003 : 0.0003 * Math.exp((L0.age - 60) / 7);
      if (r() < pDie) {
        if (h === this.faction) {
          this.succession = 8;
          this._replaceLeader(h, `dies at ${Math.floor(L0.age)}. A power struggle follows inside the ${h.name}, and for a while the police are less sure whom to obey`);
        } else this._replaceLeader(h, `dies at ${Math.floor(L0.age)}`);
        continue;
      }
      // retirement from party politics
      if (h !== this.faction && L0.age > 72 && r() < 0.02) { this._replaceLeader(h, `retires as leader of ${h.name}`); continue; }
      // a personal scandal, found out by a free and independent press
      if (h !== this.faction && r() < 0.0012 * this.P[L.liberty] * (0.3 + this.press.independent)) {
        for (const c of this.citizens) c.trust[h.id] = clamp((c.trust[h.id] || 0) - 0.08, -1, 1);
        this._replaceLeader(h, `of ${h.name} resigns after a personal scandal`);
      }
    }
  }

  _maybeSplit() {
    const r = this.rng;
    if (this.parties.length >= 8 || r() > 0.6) return;
    for (const party of this.parties.slice().sort((a, b) => b.share - a.share)) {
      if (party.share < 0.12) continue;
      const members = this.citizens.filter(c => c.lastVote === party.id);
      const unhappy = members.filter(c => sig(6 * this.expect(c, party.platform)) < 0.4);
      if (unhappy.length < 25 || unhappy.length < 0.3 * members.length) continue;
      const ideal = new Float32Array(NP);
      for (let p = 0; p < NP; p++) {
        let s = 0; for (const c of unhappy) s += Math.tanh(c.w[p] * 5);
        ideal[p] = clamp(this.P[p] + 0.35 * s / unhappy.length, 0.02, 0.98);
      }
      const child = this._foundParty(ideal, party.region);
      if (!child) return;
      const base = party.name.replace(/^The /, '').replace(/^(True|New|Real|Free|Reformed) /, '');
      const name = `${['True', 'New', 'Real', 'Free', 'Reformed'][Math.floor(r() * 5)]} ${base}`;
      if (![...this.parties, ...this.deadParties].some(q => q.name === name)) child.name = name;
      for (const c of unhappy) { c.trust[child.id] = 0.35; c.trust[party.id] = clamp((c.trust[party.id] || 0) - 0.15, -1, 1); }
      this.log(`Split! ${unhappy.length} of ${party.name}'s voters feel the party has abandoned them. A breakaway group led by ${child.leader.name} founds ${child.name}.`, 'party');
      return;
    }
  }
  _maybeMerge() {
    const r = this.rng;
    if (this.parties.length < 5 || r() > 0.5) return;
    const small = this.parties.filter(p => p.share < 0.07 && p.share > 0);
    for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
      const a = small[i].share >= small[j].share ? small[i] : small[j], b = a === small[i] ? small[j] : small[i];
      if (a.region !== b.region) continue;
      let d = 0; for (let k = 0; k < NP; k++) d += (a.platform[k] - b.platform[k]) ** 2;
      if (d > 0.3) continue;
      for (const c of this.citizens) {
        c.trust[a.id] = Math.max(c.trust[a.id] || 0, c.trust[b.id] || 0);
        if (c.lastVote === b.id) c.lastVote = a.id;
        if (c.voteIntent === b.id) c.voteIntent = a.id;
      }
      a.seats += b.seats; a.share += b.share; a.money += b.money;
      if (this.government && this.government.parties.includes(b.id)) {
        this.government.parties = this.government.parties.filter(id => id !== b.id);
        if (!this.government.parties.includes(a.id)) this.government.parties.push(a.id);
        a.govShare += b.govShare;
      }
      this.parties.splice(this.parties.indexOf(b), 1); this.deadParties.push(b);
      this.log(`Merger: two small parties with similar ideas, ${a.name} and ${b.name}, join forces as ${a.name}.`, 'party');
      return;
    }
  }

  /* ---------------- changing the system peacefully (deliberately hard) ----------------
     Elections: parties holding two-thirds of the seats must campaign for the same new system,
     in two parliaments in a row, and then 60% of voters (with at least half turning out) must say yes. */
  _constitution() {
    const bloc = new Float32Array(NI);
    for (const p of this.parties) if (p.seats > 0 && this.pushesChange(p.platform)) bloc[this.aimOf(p.platform)] += p.seats;
    let to = -1;
    for (let k = 0; k < NI; k++) if (bloc[k] >= 67 && (to < 0 || bloc[k] > bloc[to])) to = k;
    const a = this.amendment;
    if (to < 0) {
      if (a) this.log(`The push to make Veyland a ${IDEOLOGIES[a.target].name.toLowerCase()} loses its two-thirds majority. The amendment lapses.`, 'reform');
      this.amendment = null;
      return;
    }
    if (!a || a.target !== to) {
      this.amendment = { target: to, month: this.month, seats: bloc[to] };
      this.log(`First vote: ${bloc[to]} of 101 members vote to make Veyland a ${IDEOLOGIES[to].name.toLowerCase()}. It needs two-thirds again after the next election, then 60% in a referendum.`, 'reform');
      return;
    }
    this.log(`Second vote: ${bloc[to]} of 101 members again back ${IDEOLOGIES[to].name}. The question goes to a referendum.`, 'reform');
    this._referendum(to);
  }
  _referendum(to) {
    let yes = 0, no = 0;
    for (const c of this.citizens) {
      if (c.jailed) continue;
      const d = c.judge[to] - c.judge[this.regime];
      if (this.rng() > 0.5 + clamp(Math.abs(d), 0, 0.4)) continue;   // people who care more turn out more
      if (d > 0) yes++; else no++;
    }
    const n = yes + no, share = yes / Math.max(1, n), turnout = n / this.citizens.length;
    this.amendment = null;
    const res = `${Math.round(share * 100)}% yes, ${Math.round(turnout * 100)}% turnout`;
    this.referendums = this.referendums || [];
    this.referendums.push({ month: this.month, target: to, from: this.regime, share, turnout, passed: share >= 0.6 && turnout >= 0.5 });
    if (share >= 0.6 && turnout >= 0.5) {
      this.log(`Referendum passes (${res}). Veyland peacefully becomes a ${IDEOLOGIES[to].name.toLowerCase()}.`, 'reform');
      this._changeRegime(to, 'reform');
      return true;
    }
    this.log(`Referendum on ${IDEOLOGIES[to].name} fails (${res}; it needed 60% yes). The system stays.`, 'reform');
    return false;
  }
  /** Councils and assemblies: two-thirds must want the same new system for two years. Dictatorships:
      a negotiated handover only when most police and most people want the same system and the regime is very unpopular. */
  _peacefulPressure() {
    const d = this.ideology, cits = this.citizens;
    const all = new Float32Array(NI), off = new Float32Array(NI);
    let nAll = 0, nOff = 0;
    for (const c of cits) {
      if (d.rule === 'councils' && c.cls === 'owner') continue;
      nAll++; all[c.fav]++;
      if (c.cls === 'official') { nOff++; off[c.fav]++; }
    }
    let k = -1; for (let j = 0; j < NI; j++) if (j !== this.regime && (k < 0 || all[j] > all[k])) k = j;
    if (d.rule === 'councils' || d.rule === 'assembly') {
      const ok = all[k] / Math.max(1, nAll) >= 2 / 3;
      // (checked every three months)
      this.directRun = ok ? { target: k, months: this.directRun && this.directRun.target === k ? this.directRun.months + 3 : 3 } : null;
      if (this.directRun && this.directRun.months === 3) this.log(`Two-thirds of voters now want ${IDEOLOGIES[k].name}. If that lasts two years there will be a referendum.`, 'reform');
      if (this.directRun && this.directRun.months >= 24) this._referendum(k);
    } else if (this.faction) {
      const ok = off[k] / Math.max(1, nOff) >= 0.6 && all[k] / Math.max(1, nAll) >= 0.55 && this.faction.approval < 0.35;
      this.pactRun = ok ? { target: k, months: this.pactRun && this.pactRun.target === k ? this.pactRun.months + 3 : 3 } : null;
      if (this.pactRun && this.pactRun.months >= 12) {
        this.log(`Round-table talks: with its own police and most people wanting ${IDEOLOGIES[k].name}, the ${this.faction.name} agrees to hand over power peacefully.`, 'reform');
        this._changeRegime(k, 'reform');
      }
    }
  }

  _maybeFoundParty() {
    if (this.parties.length >= 8 || this.rng() > 0.6 || this.month - (this.lastFounding || -999) < 60) return;
    // people for whom no party offers anything they believe in
    const lonely = this.citizens.filter(c => {
      let best = -Infinity; for (const p of this.parties) best = Math.max(best, this.expect(c, p.platform));
      let mag = 0; for (let q = 0; q < NP; q++) mag += Math.abs(c.w[q]);
      return best < 0.02 && mag > 0.6;
    });
    // lonely people concentrated in one region found a regional party
    const byReg = new Float32Array(NR), pop = new Float32Array(NR);
    for (const c of this.citizens) pop[c.region]++;
    for (const c of lonely) byReg[c.region]++;
    let reg = -1;
    const regional = this.parties.filter(p => p.region != null).length;
    for (let k = 0; k < NR; k++) if (regional < 2 && byReg[k] >= 25 && byReg[k] >= 0.5 * pop[k] && !this.parties.some(p => p.region === k)
      && (reg < 0 || byReg[k] / pop[k] > byReg[reg] / pop[reg])) reg = k;
    if (lonely.length < this.citizens.length * 0.12 && reg < 0) return;
    this.lastFounding = this.month;
    const founders = (reg >= 0 ? lonely.filter(c => c.region === reg) : lonely).slice(0, 40);
    const ideal = new Float32Array(NP);
    for (let p = 0; p < NP; p++) {
      let s = 0; for (const c of founders) s += Math.tanh(c.w[p] * 5);
      ideal[p] = clamp(this.P[p] + 0.35 * s / founders.length, 0.02, 0.98);
    }
    const party = this._foundParty(ideal, reg >= 0 ? reg : null);
    if (party) {
      for (const c of founders) c.trust[party.id] = 0.3;
      this.log(reg >= 0 ? `${byReg[reg]} people in ${REGIONS[reg].name} feel nobody speaks for their region. They found ${party.name}, which stands only there.`
        : `${lonely.length} citizens feel nobody speaks for them. They found ${party.name}.`, 'party');
    }
  }

  /* ---------------- governing ---------------- */
  _govern() {
    const d = this.ideology, P = this.P;
    if (d.rule === 'councils' || d.rule === 'assembly') {
      // every voter pushes each law the way they believe helps them
      let n = 0; const push = new Float32Array(NP);
      for (const c of this.citizens) {
        if (d.rule === 'councils' && c.cls === 'owner') continue;
        n++; for (let p = 0; p < NP; p++) push[p] += c.w[p] > 0.03 ? 1 : c.w[p] < -0.03 ? -1 : 0;
      }
      // a law changes only when a clear majority wants it to
      for (let p = 0; p < NP; p++) { const m = push[p] / Math.max(1, n); this.target[p] = clamp(P[p] + (Math.abs(m) > 0.1 ? 0.04 * m : 0), 0, 1); }
    } else if (this.faction && this.month % 12 === (this.regimeSince + 6) % 12) {
      this._factionContest();
    }
    if (d.rule === 'elections' && this.month >= this.nextElection) this._election();
    if (d.rule !== 'elections' && this.month % 3 === 0) {
      this._peacefulPressure();
      if (this.regime !== IDX[d.id]) return;     // the system just changed
      if (d.rule === 'councils' || d.rule === 'assembly') this._warPolicy();
    }
    // snap election when the streets are full for three months
    if (d.rule === 'elections' && !this.government.caretaker) {
      this.unrestRun = this.protestFrac + this.strikeFrac > 0.35 ? this.unrestRun + 1 : 0;
      if (this.unrestRun >= 3 && this.month - this.government.since > 12) {
        this.log('Mass protests bring the government down. A snap election is called.', 'election');
        this.nextElection = this.month + 2; this.unrestRun = -6;
      }
    }
    // laws take time: the actual laws move toward the government's plan
    for (let p = 0; p < NP; p++) {
      P[p] += (this.target[p] - P[p]) * (d.rule === 'councils' || d.rule === 'assembly' ? 0.2 : 0.03);
      P[p] = clamp(P[p], d.lo[p], d.hi[p]);
    }
  }

  _factionContest() {
    const f = this.faction, d = this.ideology;
    const inputs = this._inputs(f.approval, true);
    const sample = this._sample(160);
    const snap = d.rule === 'experts' ? null : null;
    f.poolScores = f.pool.map(params => {
      const plat = this._platform(params, inputs);
      if (d.rule === 'experts') return this._forecast(plat, sample);
      // approval of their power base: police and soldiers count three times
      let s = 0, w = 0;
      for (const c of sample) { const k = c.cls === 'official' ? 3 : 1; s += k * sig(6 * (this.expect(c, plat) + this.warAppeal(c, plat))); w += k; }
      return s / w;
    });
    let bi = 0; f.poolScores.forEach((s, i) => { if (s > f.poolScores[bi]) bi = i; });
    f.brain = f.pool[bi];
    f.platform = this._platform(f.brain, inputs);
    this.target.set(f.platform.subarray(0, NP));
    this._warPolicy();
    let appr = 0; for (const c of sample) appr += c.favScore <= 0 ? 1 : 0;
    f.lastApproval = f.approval; f.approval = appr / sample.length;
    f.history.push([this.month, f.approval]);
    const delta = (f.approval - f.lastApproval) * 10;
    for (const dd of f.decisions) f.conscience[dd.s * 2 + dd.a] += 0.25 * (delta - f.conscience[dd.s * 2 + dd.a]);
    f.decisions = [];
    const kids = [f.brain];
    for (let i = 0; i < 5; i++) kids.push(this._mutate(f.brain, 0.1 + 0.1 * this.rng()));
    f.pool = kids; f.generation++;
  }

  /** Experts run the economy model forward on a candidate plan and score the result. */
  _forecast(plat, sample) {
    const sh = this._shareTargets(plat);
    const T = this._targets(plat, sh, { g: 1, austerity: 0, C: this.C, strikeBoost: 0, strikeFrac: 0, riotFrac: 0 });
    const Y = this.A * T.E, avgWage = T.lam * Y;
    const salary = avgWage * (0.85 + 0.45 * plat[L.police]);
    const snap = {
      P: plat, C: this.C, gini: clamp(this.gini + 0.25 * (sh.big - this.shares.big) - 0.1 * (plat[L.tax] - this.P[L.tax]), 0.1, 0.7),
      crime: clamp(0.02 + 0.35 * this.gini + 0.5 * T.uStar - 0.18 * plat[L.police] - 0.06 * plat[L.welfare], 0, 0.7),
      net: c => {
        const g = c.cls === 'worker' ? (1 - T.uStar) * avgWage * c.skill + T.uStar * (0.1 + 0.6 * plat[L.welfare]) * avgWage
          : c.cls === 'official' ? salary : c.cls === 'retired' ? (0.15 + 0.6 * plat[L.welfare]) * avgWage
          : c.cls === 'small' ? Y * 0.85 * Math.sqrt(c.wealthF) : c.incSmooth;
        return g * (1 - 0.6 * plat[L.tax] * 0.8);
      },
    };
    const keep = new Float32Array(NN);
    let s = 0; for (const c of sample) { keep.set(c.needs); s += this._feel(c, snap); c.needs.set(keep); }
    return s / sample.length + 0.5 * (T.E - 1) - (this.wantsWar(plat) !== !!this.war ? (this.wantsWar(plat) ? 0.05 : -0.05) : 0);   // war costs output
  }

  /* ---------------- war with the neighbour ---------------- */
  /** Does whoever governs want war? Parties and rulers learn it (a brain output); councils and assemblies vote on it. */
  _govWantsWar() {
    const d = this.ideology;
    if (this.faction) return this.wantsWar(this.faction.platform);
    if (d.rule === 'councils' || d.rule === 'assembly') {
      let yes = 0, no = 0; for (const c of this.citizens) { if (c.w[W_WAR] > 0.03) yes++; else if (c.w[W_WAR] < -0.03) no++; }
      return yes > no + this.citizens.length * 0.2;
    }
    if (!this.government || this.government.caretaker) return !!this.war && this.war.by === 'them';
    let w = 0; for (const p of this.parties) if (p.govShare > 0) w += p.govShare * (this.wantsWar(p.platform) ? 1 : 0);
    return w > 0.5;
  }
  _warPolicy() {
    const want = this._govWantsWar();
    if (!this.war && want && this.month - this.lastWarEnd >= 120) this._startWar('us');
    else if (this.war && !want && this.war.months >= 6) {
      // Veyland wants peace. Ostria agrees at once if it is losing, slowly if it is even, never while it is winning.
      const sc = this.war.score;
      if (sc > 0.2 || (sc > -0.3 && this.rng() < (this.war.by === 'us' ? 0.3 : 0.1))) this._endWar('peace');
    }
  }
  _startWar(by) {
    const gov = this.faction ? this.faction.name : this.parties.filter(p => p.govShare > 0).map(p => p.name).join(' + ') || 'the government';
    this.war = { by, since: this.month, months: 0, score: 0, deaths: 0 };
    // rallying round the flag: stronger when attacked
    for (const c of this.citizens) {
      if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] += by === 'them' ? 0.03 : 0.01;
      for (const p of this.parties) if (p.govShare > 0) c.trust[p.id] = clamp((c.trust[p.id] || 0) + (by === 'them' ? 0.15 : 0.04), -1, 1);
    }
    this.log(by === 'them' ? `War! ${NEIGHBOUR} invades Veyland. People rally behind the government.` : `War! ${gov} declares war on ${NEIGHBOUR}.`, 'war');
  }
  _endWar(how) {
    const w = this.war, r = this.rng, year = 12 * this.Ytot;
    let text;
    if (how === 'victory') {
      this.A *= w.by === 'us' ? 1.06 : 1.03; this.ostria.army *= 0.6;
      for (const c of this.citizens) if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] += 0.05;
      text = `Victory over ${NEIGHBOUR} after ${Math.round(w.months / 12 * 10) / 10} years and ${w.deaths} dead.`;
    } else if (how === 'defeat') {
      this.A *= 0.94; this.debt += 0.25 * year;
      for (const c of this.citizens) if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] -= 0.1;
      text = `Defeat! ${NEIGHBOUR} wins after ${w.deaths} Veylanders died. Veyland must pay reparations, and many blame the ${IDEOLOGIES[this.regime].name}.`;
    } else {
      if (w.score < -0.3) this.debt += 0.15 * year;
      text = `Peace with ${NEIGHBOUR} after ${w.deaths} dead, on ${w.score > 0.3 ? 'good' : w.score < -0.3 ? 'harsh' : 'even'} terms.`;
    }
    this.wars.push({ from: w.since, to: this.month, by: w.by, how, deaths: w.deaths });
    this.war = null; this.lastWarEnd = this.month;
    this.log(text, 'war');
  }
  _warStep() {
    const r = this.rng, P = this.P, o = this.ostria;
    o.A *= 1 + (0.012 + 0.02 * r.gauss()) / 12;
    o.army = clamp(o.army + 0.008 * r.gauss(), 0.2, 0.9);
    // armies: spending on police & army, the economy behind it, numbers, morale, and turmoil at home
    const ours = (0.3 + P[L.police]) * this.A * (this.citizens.length / this.N0) * (0.6 + 0.8 * this.meanS) * (1 - 2 * this.riotFrac);
    const theirs = (0.3 + o.army) * o.A;
    this.strength = { ours, theirs };
    if (!this.war) {
      // Ostria attacks rarely, more often when Veyland is weak or in turmoil
      if (this.month - this.lastWarEnd >= 180) {
        const p = 0.0004 * (1 + 3 * (this.riotFrac + this.protestFrac)) * clamp(theirs / ours, 0.3, 1.5) * (1 + 2 * this.tension);
        if (r() < p) this._startWar('them');
      }
      return;
    }
    const w = this.war;
    w.months++;
    w.score = clamp(w.score + 0.04 * (ours - theirs) / (ours + theirs) + 0.02 * r.gauss(), -1, 1);
    // soldiers fall, and some young conscripts
    for (let i = 0; i < this.citizens.length; i++) {
      const c = this.citizens[i];
      const pDie = c.cls === 'official' ? 0.005 : (c.cls === 'worker' && c.age < 35) ? 0.001 : 0;
      if (pDie && r() < pDie * (1 + Math.max(0, -w.score))) { this._replace(i); w.deaths++; }
    }
    if (w.score >= 1) this._endWar('victory');
    else if (w.score <= -1) this._endWar('defeat');
  }

  /* ---------------- events: disasters, booms and busts, foreign affairs ----------------
     Nothing here tells anyone what to do. The world just happens, more or less likely
     depending on the laws (weak safety rules make mine disasters likelier, good schools
     make inventions likelier...), and everyone reacts with what they have learned. */
  _disaster(k, filter, victims, hurt, cost, text) {
    const r = this.rng, P = this.P;
    const idx = []; this.citizens.forEach((c, i) => { if (c.region === k && filter(c)) idx.push(i); });
    let died = 0;
    for (; died < victims && idx.length; died++) this._replace(idx.splice(Math.floor(r() * idx.length), 1)[0]);
    // good public services and welfare soften the blow
    const care = 1.3 - 0.5 * P[L.services] - 0.3 * P[L.welfare];
    this.hurt[k] = clamp(this.hurt[k] + hurt * care, 0, 1);
    this.debt += cost * 12 * this.Ytot;
    this.log(text.replace('{died}', died === 1 ? 'one' : died).replace(/\{s\}/g, died === 1 ? '' : 's').replace('{region}', REGIONS[k].name), 'disaster');
    return died;
  }
  _events() {
    const r = this.rng, P = this.P, reg = P[L.regulation];
    for (let k = 0; k < NR; k++) this.hurt[k] *= 0.93;
    this.tension *= 0.98;
    if (this.sanctions > 0) { this.sanctions--; if (P[L.liberty] >= 0.5) { this.sanctions = 0; this.log('Other countries lift their sanctions now that Veyland is freer.', 'economy'); } }
    const RG = Object.fromEntries(REGIONS.map((x, k) => [x.name, k]));
    const workers = c => c.cls === 'worker' && c.employed, anyone = () => true;
    // industrial accidents: weak safety rules make them likelier
    if (r() < 0.0015 * (1.3 - reg)) this._disaster(RG.Highcombe, workers, 2 + Math.floor(r() * 7), 0.5, 0.005, `Mine disaster in {region}: {died} miner{s} killed.${reg < 0.35 ? ' Safety rules were weak.' : ''}`);
    if (r() < 0.0015 * (1.3 - reg)) this._disaster(RG.Ironvale, workers, 1 + Math.floor(r() * 6), 0.4, 0.008, `A huge factory fire in {region} kills {died} worker{s}.${reg < 0.35 ? ' Inspectors had been cut.' : ''}`);
    // nature
    if (r() < 0.002) {
      const k = [RG.Redfield, RG.Fenwick, RG.Saltmere][Math.floor(r() * 3)];
      if (k === RG.Redfield) this.harvest = Math.min(this.harvest || 1, 0.7);
      this._disaster(k, anyone, Math.floor(r() * 4), 0.45, 0.01, 'Floods in {region}: thousands of homes are damaged and {died} drown.');
    }
    if (r() < 0.0006) { this.A *= 0.98; this._disaster(Math.floor(r() * NR), anyone, 2 + Math.floor(r() * 5), 0.8, 0.04, 'Earthquake in {region}: {died} people die and whole streets collapse. Rebuilding will take years.'); }
    if (r() < 0.0008) {
      let died = 0;
      for (let i = 0; i < this.citizens.length; i++) { const c = this.citizens[i]; if (r() < (c.age > 60 ? 0.08 : 0.01) * (1.3 - P[L.services])) { this._replace(i); died++; } }
      for (let k = 0; k < NR; k++) this.hurt[k] = clamp(this.hurt[k] + 0.2 * (1.3 - P[L.services]), 0, 1);
      this.log(`An epidemic sweeps Veyland: ${died} people die, mostly the old.${P[L.services] > 0.6 ? ' Good hospitals keep the toll down.' : P[L.services] < 0.3 ? ' Hospitals are overwhelmed.' : ''}`, 'disaster');
    }
    // the economy: crashes come after booms where finance is lightly regulated
    if (r() < 0.001 * (1.6 - reg) * (1 + 10 * Math.max(0, this.growth - 0.02))) {
      this.g -= 0.15; this.A *= 0.98;
      this.log(`Market crash! Banks that lent too freely collapse${reg < 0.35 ? ' (regulation was light)' : ''}. Firms cut jobs.`, 'economy');
    }
    if (r() < 0.0015) { this.g -= 0.06 + 0.1 * P[L.trade]; this.log(`Prices of fuel and raw materials jump around the world${P[L.trade] > 0.6 ? '. Veyland trades a lot, so it is hit hard' : ''}.`, 'economy'); }
    if (r() < 0.0015) { this.g += 0.06; this.log('A boom in the wider world: orders for Veyland\'s goods pour in.', 'economy'); }
    if (r() < 0.0015 * (0.4 + P[L.services] + 0.5 * P[L.liberty])) { this.A *= 1.025; this.log(`Veylander inventors make a breakthrough${P[L.services] > 0.6 ? ', thanks to good schools and universities' : ''}. Firms become more productive.`, 'economy'); }
    if (!this.mineralsFound && r() < 0.0004) {
      this.mineralsFound = true; this.A *= 1.03; this.C = Math.min(1, this.C + 0.05);
      this.log('Rich mineral deposits are discovered in Highcombe. Money flows in, and so do people hoping for a cut.', 'economy');
    }
    // abroad
    if (!this.war && r() < 0.002) { this.tension = Math.min(1, this.tension + 0.4); this.log(`Border incident: shots are fired on the border with ${NEIGHBOUR}. Tension rises.`, 'war'); }
    if (!this.war && P[L.trade] > 0.5 && this.tension < 0.2 && this.month - this.lastWarEnd > 120 && r() < 0.0015) {
      this.g += 0.03; this.tension = Math.max(0, this.tension - 0.2);
      this.log(`Veyland and ${NEIGHBOUR} sign a trade deal. Exporters cheer.`, 'economy');
    }
    if (!this.sanctions && P[L.liberty] < 0.3 && r() < 0.004) { this.sanctions = 48; this.log('Other countries put sanctions on Veyland over its lack of freedom. Trade suffers.', 'economy'); }
    if (P[L.liberty] > 0.4 && this.citizens.length < this.N0 * 1.25 && r() < 0.0015 * (this.g < 0.9 ? 4 : 1)) {
      const n = 8 + Math.floor(r() * 15);
      for (let t = 0; t < n; t++) this._immigrant(this.abroad * 0.8);
      this.log(`A wave of ${n} refugees arrives, fleeing a crisis abroad.`, 'migration');
    }
    // assassination attempts: likelier in turbulent times
    if (r() < 0.0004 + 0.01 * (this.riotFrac + 0.3 * this.protestFrac)) {
      const targets = this.faction ? [this.faction] : this.parties.filter(p => p.govShare > 0);
      const h = targets[Math.floor(r() * targets.length)];
      if (h && h.leader) {
        const name = h.leader.name;
        if (r() < 0.35) {
          if (h === this.faction) this.succession = 8;
          for (const c of this.citizens) if (h !== this.faction) c.trust[h.id] = clamp((c.trust[h.id] || 0) + 0.1, -1, 1);
          this._replaceLeader(h, `is assassinated${h === this.faction ? '. Rival factions scramble for power' : '. The country is in shock and sympathy for ' + h.name + ' grows'}`);
        } else {
          for (const c of this.citizens) if (h !== this.faction) c.trust[h.id] = clamp((c.trust[h.id] || 0) + 0.04, -1, 1);
          this.log(`${name} (${h.name}) survives an assassination attempt.`, 'unrest');
        }
      }
    }
    // a feel-good moment
    if (r() < 0.002) {
      for (const c of this.citizens) for (const p of this.parties) if (p.govShare > 0) c.trust[p.id] = clamp((c.trust[p.id] || 0) + 0.03, -1, 1);
      this.log(['Veyland wins the continental football cup! The country celebrates.', 'A Veylander wins a world prize for literature.', 'Veyland\'s athletes come home with a record haul of medals.'][Math.floor(r() * 3)], 'news');
    }
    // news reports on what is happening anyway (these only describe, they change nothing)
    const once = (key, gap, text, kind) => { if (this.month - (this.news[key] ?? -999) >= gap) { this.news[key] = this.month; this.log(text, kind); } };
    if (this.strikeFrac > 0.25) once('strike', 24, `General strike: ${Math.round(this.strikeFrac * 100)}% of workers walk out.`, 'unrest');
    if (this.protestFrac > 0.15) once('protest', 24, `Mass protests: ${Math.round(this.protestFrac * this.citizens.length)} people are on the streets.`, 'unrest');
  }
  _immigrant(s0) {
    const r = this.rng, w = [3, 2, 1, 3, 1, 1];
    let x = r() * 11, region = 0;
    while (x > w[region]) { x -= w[region]; region++; }
    const c = this._newCitizen(null, 20 + r() * 20, region);
    c.home = this.freeHomes.length ? this.freeHomes.pop() : this.nextHome++;
    c.employed = false; c.immigrant = true; c.abroad = this.abroad;
    c.s = s0; c.sRef = s0; c.sHist.fill(s0);
    this.citizens.push(c); this.immigYear++;
    return c;
  }

  /* ---------------- lobbies and corruption ---------------- */
  _lobbies() {
    const r = this.rng, P = this.P, d = this.ideology, pr = this.press;
    // who owns the press: the state takes over where speech is not free; bought papers are slowly sold on
    pr.state += (clamp(1.3 * (0.7 - P[L.liberty]), 0, 0.9) - pr.state) * 0.05;
    let owned = 0;
    for (const l of this.lobbies) { pr[l.id] *= 0.995; owned += pr[l.id]; }
    const room = Math.max(0, 1 - pr.state) * 0.9;
    if (owned > room) for (const l of this.lobbies) pr[l.id] *= room / owned;
    owned = this.lobbies.reduce((t, l) => t + pr[l.id], 0);
    pr.independent = Math.max(0, 1 - pr.state - owned);
    // bought papers spin the news their owners' way
    for (const l of this.lobbies) {
      const sh = pr[l.id];
      if (sh < 0.02 || !l.avgW) continue;
      for (const c of this.citizens) {
        if (r() > 0.3) continue;
        c.w[l.top] += 0.006 * sh * l.dir;
        if (l.friend) c.trust[l.friend] = clamp((c.trust[l.friend] || 0) + 0.004 * sh, -1, 1);
      }
    }
    for (const l of this.lobbies) {
      const members = this.citizens.filter(c => c.cls === l.cls && !c.jailed);
      const banned = (l.id === 'unions' && P[L.unions] < 0.1) || members.length === 0;
      let dues = 0; for (const c of members) dues += c.net * 0.01 * (l.id === 'unions' ? P[L.unions] : 1);
      l.money += banned ? 0 : dues;
      l.members = members.length;
      if (this.month % 12 !== 4) continue;
      const sNow = members.reduce((s, c) => s + c.s, 0) / Math.max(1, members.length);
      // learn: did last year's choice help our members?
      if (l.last) { const qi = l.last.s * NLA + l.last.a; l.q[qi] += 0.3 * ((sNow - l.sBefore) * 20 - l.q[qi]); }
      l.sBefore = sNow;
      if (banned) { l.last = null; l.action = 'banned'; continue; }
      // what our members believe would help them most
      const avgW = new Float32Array(NP);
      for (const c of members) for (let p = 0; p < NP; p++) avgW[p] += c.w[p] / members.length;
      let top = 0; for (let p = 0; p < NP; p++) if (Math.abs(avgW[p]) > Math.abs(avgW[top])) top = p;
      l.top = top; l.dir = Math.sign(avgW[top]) || 1; l.avgW = avgW;
      const st = (d.rule === 'elections' ? 2 : 0) + (P[L.liberty] > 0.5 ? 1 : 0);
      let a = 0;
      if (r() < 0.15) a = Math.floor(r() * NLA);
      else for (let b = 1; b < NLA; b++) if (l.q[st * NLA + b] > l.q[st * NLA + a]) a = b;
      if (a === 3 && room - owned < 0.02) a = 0;   // nothing left to buy
      if (a === 1 && d.rule !== 'elections') a = 2;
      l.last = { s: st, a };
      const amount = l.money * 0.8;
      if (a === 0) { l.action = 'saved'; continue; }
      if (a === 1) {
        // donate to the party that promises most of what members want
        let best = null, bv = -Infinity;
        for (const p of this.parties) { const v = l.dir * (p.platform[top] - P[top]) + 0.3 * p.share; if (v > bv) { bv = v; best = p; } }
        if (!best) { l.action = 'saved'; continue; }
        best.money += amount; best.donors[l.id] = (best.donors[l.id] || 0) + 1; l.money -= amount; l.friend = best.id;
        l.action = `donated to ${best.name}`;
        l.log.push([this.month, l.action]);
      } else if (a === 3) {
        // buy newspapers: a bigger slice of the press costs more
        const price = 0.3 * Math.max(1, this.Ytot);
        const gain = Math.min(room - owned, 0.25 * amount / price);
        pr[l.id] += gain; owned += gain; pr.independent = Math.max(0, 1 - pr.state - owned); l.money -= amount;
        l.action = `bought newspapers (now owns ${Math.round(pr[l.id] * 100)}% of the press)`;
        l.log.push([this.month, l.action]);
      } else {
        // offer a bribe to whoever holds power
        const taker = this._ruler();
        if (!taker) { l.action = 'saved'; continue; }
        const ts = P[L.liberty] < 0.3 ? 0 : P[L.liberty] < 0.7 ? 1 : 2;
        const qa = taker.conscience;
        const accept = r() < 0.15 ? r() < 0.5 : qa[ts * 2 + 1] >= qa[ts * 2];
        taker.decisions.push({ s: ts, a: accept ? 1 : 0 });
        if (accept) {
          P[top] = clamp(P[top] + 0.05 * l.dir, d.lo[top], d.hi[top]);
          this.target[top] = clamp(this.target[top] + 0.03 * l.dir, 0, 1);
          taker.money += amount; l.money -= amount; taker.bribes++;
          this.C = Math.min(1, this.C + 0.03 * (1 - this.C));
          this.pending.push({ month: this.month, taker: taker === this.faction ? 'faction' : taker.id, takerName: taker.name, lobby: l.id, policy: top });
          l.action = `bribed ${taker.name} (${POLICIES[top].name} ${l.dir > 0 ? 'up' : 'down'})`;
        } else l.action = `bribe refused by ${taker.name}`;
        l.log.push([this.month, l.action]);
      }
      if (l.log.length > 40) l.log.shift();
    }
    // the press digs: independent papers report anything; a lobby's own papers bury its bribes; state media never expose the rulers
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      const taker = b.taker === 'faction' ? this.faction : this.parties.find(p => p.id === b.taker);
      if (!taker || this.month - b.month > 48) { this.pending.splice(i, 1); continue; }
      const rivals = this.lobbies.reduce((t, l) => t + (l.id === b.lobby ? 0 : pr[l.id]), 0);
      if (r() < 0.03 * P[L.liberty] * (pr.independent + 0.7 * rivals)) {
        this.pending.splice(i, 1);
        taker.scandals++;
        const isParty = taker !== this.faction;
        for (const c of this.citizens) {
          if (isParty) c.trust[taker.id] = clamp((c.trust[taker.id] || 0) - 0.3 - (c.lastVote === taker.id ? 0.1 : 0), -1, 1);
          else if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] -= 0.03;
        }
        const lob = this.lobbies.find(l => l.id === b.lobby);
        this.log(`Scandal! The press reveals that ${taker.name} took money from the ${lob.name} to change ${POLICIES[b.policy].name.toLowerCase()}.`, 'scandal');
        if (isParty) this.lastScandal = { party: taker.id, month: this.month };
      }
    }
  }
  _ruler() {
    if (this.faction) return this.faction;
    if (!this.government || this.government.caretaker) return null;
    let best = null; for (const p of this.parties) if (p.govShare > (best ? best.govShare : 0)) best = p;
    return best;
  }

  /* ---------------- life and death ---------------- */
  _lifecycle() {
    const r = this.rng, cits = this.citizens;
    for (let i = 0; i < cits.length; i++) {
      const c = cits[i];
      c.age += 1 / 12;
      if (c.age >= 65 && c.cls !== 'retired') { c.cls = 'retired'; c.employed = false; }
      const pDie = c.age < 60 ? 0.0003 : 0.0003 * Math.exp((c.age - 60) / 7);
      if (r() < pDie) this._replace(i);
    }
    if (this.month % 12 === 0) this._reconcileClasses(false);
  }
  /** Someone dies: a young person from a local family takes their place (and their home). */
  _replace(i) {
    const r = this.rng, cits = this.citizens, c = cits[i];
    let parent = null;
    for (let t = 0; t < 10 && !parent; t++) { const o = cits[Math.floor(r() * cits.length)]; if (o !== c && o.region === c.region) parent = o; }
    const kid = this._newCitizen(parent || c, 18, c.region);
    kid.cls = parent && (parent.cls === 'owner' || parent.cls === 'small') && r() < 0.7 ? parent.cls : 'worker';
    if (c.cls === 'owner' && r() < 0.8) { kid.cls = 'owner'; kid.wealthF = c.wealthF; }   // inheritance
    kid.home = c.home; kid.employed = r() > this.u;
    cits[i] = kid;
    return kid;
  }

  /** People leave when they believe life abroad is better (from letters home), and arrive when Veyland looks better. */
  _migration() {
    const r = this.rng, P = this.P;
    const rep = P[L.police] * (1 - P[L.liberty]);
    this.abroad = clamp(0.62 + 0.25 * (this.g - 1), 0.4, 0.75);
    // letters from those who left arrive six months later, read by family and friends back home
    for (let i = this.letters.length - 1; i >= 0; i--) {
      const lt = this.letters[i];
      if (lt.month > this.month) continue;
      this.letters.splice(i, 1);
      const home = this.citizens.filter(c => c.region === lt.region);
      for (let k = 0; k < 6 && home.length; k++) { const c = home[Math.floor(r() * home.length)]; c.abroad += 0.3 * (lt.value - c.abroad); }
    }
    const leavers = [];
    for (const c of this.citizens) {
      if (P[L.liberty] > 0.5 && r() < 0.02) c.abroad += 0.1 * (this.abroad - c.abroad);   // a free press reports on life abroad
      if (c.jailed || c.age > 60) continue;
      const ties = 0.12 + 0.003 * (c.age - 18) + (c.cls === 'owner' || c.cls === 'small' ? 0.08 : 0) + (c.cls === 'official' ? 0.05 : 0);
      const gap = c.abroad + 0.05 * (c.skill - 1) - c.sRef - ties;
      if (gap <= 0 || r() > Math.min(0.03, gap * 0.15)) continue;
      // closed borders: the police stop people fleeing
      if (r() < rep * 0.8) {
        if (r() < 0.5) { c.jailed = 6 + Math.floor(r() * 13); c.arrests++; this.caughtYear++; }
        c.abroad -= 0.05;
        continue;
      }
      leavers.push(c);
    }
    if (leavers.length && this.citizens.length - leavers.length >= 150) {
      const gone = new Set(leavers);
      for (const c of leavers) {
        this.letters.push({ month: this.month + 6, region: c.region, value: clamp(this.abroad + 0.05 * (c.skill - 1) - 0.07 + 0.05 * r.gauss(), 0, 1) });
        this.freeHomes.push(c.home);
        this.departures.push({ month: this.month, home: c.home, region: c.region });
      }
      if (this.departures.length > 80) this.departures.splice(0, this.departures.length - 80);
      this.citizens = this.citizens.filter(c => !gone.has(c));
      this.emigYear += leavers.length;
      if (leavers.length >= 5) this.log(`${leavers.length} people emigrate this month, hoping for a better life abroad.`, 'migration');
    }
    // immigrants: they know nothing about Veyland's politics yet
    const pull = this.meanS - this.abroad - 0.03;
    if (pull > 0 && P[L.liberty] > 0.3 && this.citizens.length < this.N0 * 1.15) {
      for (let t = 0; t < 2; t++) if (r() < pull * 0.6) this._immigrant(this.abroad);
    }
  }

  /* ---------------- one month ---------------- */
  step() {
    this._lifecycle();
    this._economy();
    this._citizens();
    this._unrest();
    this._migration();
    this._govern();
    this._coalitionCheck();
    this._leaders();
    this._events();
    this._warStep();
    this._lobbies();
    const snapP = new Float32Array(NW); snapP.set(this.P); snapP[W_WAR] = this.war ? 1 : 0;
    this.Phist.push(snapP);
    if (this.Phist.length > 24) this.Phist.shift();
    if (this.month % 3 === 0) this._voteIntents();
    if (this.month % 12 === 0) this._record();
    this.month++;
  }

  _record() {
    const prev = this.history[this.history.length - 1];
    const gdp = this.yearOut / Math.max(1, this.yearMonths) * 12;   // output per person over the past year
    this.yearOut = 0; this.yearMonths = 0;
    this.growth = prev ? gdp / prev.gdp - 1 : 0;
    if (prev && this.month > 24) {
      if (this.growth < -0.02) this.log(`Recession: the economy shrank ${Math.round(-this.growth * 100)}% this year.`, 'economy');
      else if (this.growth > 0.05) this.log(`Boom year: the economy grew ${Math.round(this.growth * 100)}%.`, 'economy');
      let crime = 0; for (let k = 0; k < NR; k++) crime += this.crime[k] / NR;
      if (crime > prev.crime + 0.05) this.log('A crime wave: robberies and violence rise sharply.', 'unrest');
    }
    const favs = new Float32Array(NI); for (const c of this.citizens) favs[c.fav]++;
    let crime = 0; for (let k = 0; k < NR; k++) crime += this.crime[k] / NR;
    this.history.push({
      year: Math.round(this.month / 12), gdp, u: this.u, gini: this.gini, s: this.meanS,
      unrest: this.protestFrac + this.riotFrac + this.strikeFrac * 0.5, riot: this.riotFrac, crime, debt: this.debtRatio, C: this.C, regime: this.regime,
      favs: Array.from(favs, x => x / this.citizens.length), P: Array.from(this.P),
      polls: this.parties.map(p => ({ id: p.id, name: p.name, color: p.color, share: p.poll || 0 })),
      pop: this.citizens.length, emig: this.emigYear, immig: this.immigYear, war: this.war ? this.war.score : null,
      press: { ...this.press },
    });
    this.emigYear = 0; this.immigYear = 0; this.caughtYear = 0;
    if (this.history.length > 600) this.history.shift();
    if (this.deadParties.length > 30) this.deadParties.splice(0, this.deadParties.length - 30);
    // forget trust in parties that no longer exist
    const live = new Set(this.parties.map(p => p.id));
    for (const c of this.citizens) for (const id of Object.keys(c.trust)) if (!live.has(id)) delete c.trust[id];
  }

  /* ---------------- shocks the viewer can cause (the world changes, nobody is told what to do) ---------------- */
  shock(kind) {
    if (kind === 'slump') { this.g -= 0.35; this.log('You caused a deep world slump: orders collapse across Veyland.', 'shock'); }
    else if (kind === 'harvest') { this.harvest = 0.4; this.log('You caused a terrible harvest: farms earn less than half of normal this year.', 'shock'); }
    else if (kind === 'debt') { this.debt += 1.2 * 12 * this.Ytot; this.log('You loaded the state with a huge old debt (120% of a year\'s output).', 'shock'); }
    else if (kind === 'epidemic') {
      let died = 0;
      for (let i = 0; i < this.citizens.length; i++) {
        const c = this.citizens[i];
        if (this.rng() < (c.age > 60 ? 0.12 : 0.02) * (1.3 - this.P[L.services])) { this._replace(i); died++; }
      }
      this.A *= 0.97;
      this.log(`You caused an epidemic: ${died} people die. Good health care saves lives.`, 'shock');
    } else if (kind === 'quake') {
      this.A *= 0.98; this._disaster(Math.floor(this.rng() * NR), () => true, 4, 0.8, 0.04, 'You caused an earthquake in {region}: {died} people die.');
    } else if (kind === 'crash') {
      this.g -= 0.15; this.A *= 0.98; this.log('You caused a market crash: banks collapse and firms cut jobs.', 'economy');
    } else if (kind === 'refugees') {
      const n = 25; for (let t = 0; t < n; t++) this._immigrant(this.abroad * 0.8);
      this.log(`You sent ${n} refugees to Veyland.`, 'migration');
    } else if (kind === 'flood') {
      this._disaster(2, () => true, 2, 0.5, 0.01, 'You caused floods in {region}: {died} people drown.'); this.harvest = 0.7;
    } else if (kind === 'assassin') {
      const h = this.faction || this.parties.find(p => p.govShare > 0);
      if (h) { if (h === this.faction) this.succession = 8; this._replaceLeader(h, 'is assassinated (you did this)'); }
    } else if (kind === 'war') {
      if (this.war) return;
      this.ostria.army = Math.min(0.9, this.ostria.army + 0.2);
      this.log(`You made ${NEIGHBOUR} arm itself and attack.`, 'shock');
      this._startWar('them');
    }
  }

  /* ---------------- saving and loading a whole country ---------------- */
  toJSON() {
    const state = {};
    for (const k of Object.keys(this)) if (k !== 'rng' && k !== '_net') state[k] = this[k];
    state.rngState = this.rng.state();
    return { format: SAVE_FORMAT, formatVersion: 1, app: 'Glass Box', savedAt: new Date().toISOString(), year: Math.floor(this.month / 12), world: encode(state) };
  }
  /** Returns { ok: true, world } or { ok: false, error }. */
  static fromJSON(j) {
    if (!j || j.format !== SAVE_FORMAT) return { ok: false, error: 'Not a Glass Box politics save file.' };
    if (j.formatVersion !== 1) return { ok: false, error: `Unsupported formatVersion ${j.formatVersion}.` };
    try {
      const w = Object.create(World.prototype);
      Object.assign(w, decode(j.world));
      w.rng = makeRng(w.rngState); delete w.rngState;
      // saves from before events existed
      if (!w.hurt) w.hurt = new Float32Array(NR);
      for (const k of ['tension', 'sanctions', 'succession']) if (typeof w[k] !== 'number') w[k] = 0;
      if (!w.news) w.news = {};
      for (const h of [...w.parties, ...(w.faction ? [w.faction] : [])]) if (!h.leader) h.leader = w._newLeader();
      if (!Array.isArray(w.citizens) || !w.citizens.length) throw new Error('no citizens');
      return { ok: true, world: w };
    } catch (e) { return { ok: false, error: 'The file is damaged: ' + e.message }; }
  }

  /* ---------------- for the page ---------------- */
  /** What the average citizen of a class (or everyone) believes each law does. */
  beliefs(filter) {
    const out = new Float32Array(NW); let n = 0;   // every law, then war
    for (const c of this.citizens) if (!filter || filter(c)) { n++; for (let p = 0; p < NW; p++) out[p] += c.w[p]; }
    for (let p = 0; p < NW; p++) out[p] /= Math.max(1, n);
    return out;
  }
  /** Q-values (how a citizen feels about each action) in their current situation. */
  actionValues(c) { return ACTIONS.map((_, a) => this._q(c, c.feat, a)); }
}

/* Save files: plain JSON. Typed arrays become base64 (exact, keeps NaN = "never lived under it"); Infinity becomes a string. */
function encode(v) {
  if (v instanceof Float32Array) return { $f32: toBase64(v) };
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $num: String(v) };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = encode(v[k]); return o; }
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (typeof v.$f32 === 'string') return fromBase64(v.$f32);
    if (typeof v.$num === 'string') return Number(v.$num);
    const o = {}; for (const k of Object.keys(v)) o[k] = decode(v[k]); return o;
  }
  return v;
}

const api = { World, POLICIES, NEEDS, IDEOLOGIES, REGIONS, FAMILIES, ACTIONS, FEATURES, BRAIN_SIZES, INPUT_NAMES, OUTPUT_NAMES, LOBBY_ACTIONS, PARTY_COLORS, NEIGHBOUR, W_WAR, OUT_CHANGE, OUT_WAR, familyOf, L };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Politics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
