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
  { id: 'faith',      name: 'Religion in public life', help: 'How much the Lantern Church shapes schools, laws and holidays' },
  { id: 'autonomy',   name: 'Regional autonomy',       help: 'How much the provinces run their own affairs, languages and schools' },
];
const NP = POLICIES.length;
const L = {}; POLICIES.forEach((p, i) => { L[p.id] = i; });

const NEEDS = ['Money', 'Health', 'Safety', 'Freedom', 'Fairness', 'Dignity', 'Belonging'];
const NN = NEEDS.length;

/* ---------------- systems of government ----------------
   rule: how laws get made.  lock: ranges this system forces some laws into.
   typical: what citizens imagine life under it would be (used to judge it).
   base: whose approval a ruling faction cares about (police count 3× unless said otherwise).
   Law order:  tax, welfare, services, wage, unions, state, coops, smallprop, regulation, police, liberty, trade, faith, autonomy */
const V = (...x) => x;
const IDEOLOGIES = [
  { id: 'democracy', name: 'Liberal democracy', rule: 'elections', hue: '#3987e5',
    blurb: 'Parties compete in free elections. Private firms, a free press, laws made by whoever wins.',
    lock: { liberty: [0.6, 1] }, typical: V(.35, .35, .45, .35, .35, .1, .05, .3, .4, .4, .85, .6, .25, 0.4) },
  { id: 'communism', name: 'Communism', rule: 'party', hue: '#e66767', faction: "Workers' Unity Party",
    blurb: 'One party runs the state, the state runs the economy. Jobs for all, little freedom, no church in public life.',
    lock: { state: [0.85, 1], coops: [0, 0.1], smallprop: [0, 0.15], liberty: [0, 0.25], police: [0.6, 1], unions: [0.2, 0.4], faith: [0, 0.15] },
    typical: V(.7, .6, .7, .6, .3, .95, .05, .05, .6, .8, .1, .2, 0, 0.1) },
  { id: 'syndicalism', name: 'Syndicalism', rule: 'councils', hue: '#d95926',
    blurb: 'Unions own and run the industries. Workers\' councils vote on each law.',
    lock: { unions: [0.9, 1], coops: [0.7, 1], state: [0, 0.2], liberty: [0.45, 1] }, typical: V(.4, .5, .6, .8, 1, .1, .85, .3, .5, .3, .6, .4, .1, 0.6) },
  { id: 'mutualism', name: 'Mutualism', rule: 'assembly', hue: '#199e70',
    blurb: 'Co-ops and small owners trade freely, a tiny state, everyone votes directly on each law.',
    lock: { coops: [0.5, 1], smallprop: [0.6, 1], state: [0, 0.1], tax: [0, 0.25], police: [0, 0.25], liberty: [0.8, 1] },
    typical: V(.15, .3, .4, .4, .6, .05, .65, .75, .3, .15, .9, .6, .15, 0.8) },
  { id: 'distributism', name: 'Distributism', rule: 'elections', hue: '#c98500',
    blurb: 'Property spread widely: family farms, workshops, guilds. Elections, but no giant firms.',
    lock: { smallprop: [0.75, 1], state: [0, 0.25], coops: [0.3, 0.7], liberty: [0.5, 1] }, typical: V(.35, .4, .5, .45, .5, .15, .4, .9, .5, .4, .7, .35, .55, 0.55) },
  { id: 'fascism', name: 'Fascism', rule: 'party', hue: '#8a6a4a', faction: 'Iron Front', base: { official: 3, patriots: 3 },
    blurb: 'One party, the nation above all. Unions banned, big firms kept loyal, a strong police.',
    lock: { liberty: [0, 0.15], unions: [0, 0.05], coops: [0, 0.05], police: [0.85, 1], trade: [0, 0.35], autonomy: [0, 0.2] }, typical: V(.45, .3, .4, .3, 0, .3, 0, .2, .6, 1, .05, .15, .5, 0.05) },
  { id: 'technocracy', name: 'Technocracy', rule: 'experts', hue: '#9085e9', faction: 'Bureau of Experts',
    blurb: 'No elections. Experts with an economic model pick the laws they forecast will work best.',
    lock: { liberty: [0.35, 0.7] }, typical: V(.4, .4, .6, .4, .3, .25, .1, .3, .6, .4, .5, .6, .1, 0.3) },
  { id: 'freemarket', name: 'Free-market minarchy', rule: 'elections', hue: '#d55181',
    blurb: 'Elections, but the state is kept tiny: almost no taxes, welfare or rules.',
    lock: { tax: [0, 0.15], welfare: [0, 0.1], state: [0, 0.05], regulation: [0, 0.2], wage: [0, 0.1], liberty: [0.75, 1] },
    typical: V(.1, .05, .15, 0, .1, 0, .05, .3, .1, .3, .9, .95, .2, 0.5) },
  { id: 'junta', name: 'Military junta', rule: 'party', hue: '#7d8a5a', faction: 'Council of Generals',
    blurb: 'The army rules. Order first, no elections, little freedom.',
    lock: { police: [0.9, 1], liberty: [0, 0.2] }, typical: V(.3, .2, .3, .25, .1, .25, .05, .25, .4, 1, .1, .4, .4, 0.1) },
  { id: 'natsynd', name: 'National syndicalism', rule: 'party', hue: '#b5652e', faction: 'National Guild Front', base: { official: 3, unionclub: 2, patriots: 3 },
    blurb: 'One nationalist party runs the economy through state-controlled unions and guilds. Little freedom, strong police.',
    lock: { unions: [0.6, 1], liberty: [0, 0.25], police: [0.7, 1], trade: [0, 0.4], coops: [0.3, 0.8], state: [0.2, 0.6] },
    typical: V(.45, .45, .5, .55, .8, .4, .5, .3, .6, .9, .1, .2, .5, 0.15) },
  { id: 'absmon', name: 'Absolute monarchy', rule: 'crown', hue: '#b08d2e', faction: 'The Royal Court', base: { official: 3, owner: 2, church: 2 },
    blurb: 'A king or queen rules for life, and the crown passes to their heir. Nobles and the church stand behind the throne.',
    lock: { liberty: [0, 0.3], police: [0.5, 1], faith: [0.4, 1] }, typical: V(.35, .25, .3, .2, .1, .3, .05, .3, .4, .8, .15, .4, .7, 0.2) },
  { id: 'constmon', name: 'Constitutional monarchy', rule: 'elections', hue: '#6fa8c9', monarch: true,
    blurb: 'A monarch reigns as a symbol of the nation; elected parties govern. The crown gives the system extra loyalty.',
    lock: { liberty: [0.6, 1] }, typical: V(.35, .35, .45, .3, .35, .1, .05, .35, .4, .5, .8, .55, .4, 0.4) },
  { id: 'distmon', name: 'Monarcho-distributism', rule: 'crown', hue: '#a3b05a', faction: 'The Crown and Guilds', base: { official: 3, farmcoop: 2, church: 2 },
    blurb: 'A Catholic-style royal order of family farms, workshops and guilds: a monarch, the church, and property spread among many.',
    lock: { smallprop: [0.75, 1], state: [0, 0.2], liberty: [0.2, 0.7], faith: [0.4, 1] }, typical: V(.3, .4, .45, .45, .5, .1, .45, .9, .5, .55, .45, .3, .7, 0.5) },
  { id: 'anarcom', name: 'Anarcho-communism', rule: 'assembly', hue: '#c94b6a',
    blurb: 'No state and no bosses: communes own everything in common, everyone votes directly, almost no police.',
    lock: { coops: [0.8, 1], state: [0, 0.1], police: [0, 0.15], liberty: [0.8, 1], smallprop: [0, 0.3], tax: [0, 0.2], faith: [0, 0.3] },
    typical: V(.1, .7, .6, .5, .8, .05, .95, .1, .4, .05, .95, .3, 0, 0.9) },
  { id: 'theocracy', name: 'Theocracy', rule: 'clergy', hue: '#c7a6e0', faction: 'Council of Elders', base: { official: 2, church: 3 },
    blurb: 'The Lantern Church rules. Its elders make the laws; faith shapes schools, courts and daily life.',
    lock: { faith: [0.8, 1], liberty: [0, 0.4] }, typical: V(.4, .5, .45, .35, .2, .3, .1, .4, .6, .7, .15, .3, 1, 0.2) },
  { id: 'plutocracy', name: 'Plutocracy', rule: 'wealth', hue: '#e0c068',
    blurb: 'Elections where every vote counts by how much the voter earns. The rich decide; the poor can still protest.',
    lock: { tax: [0, 0.25], welfare: [0, 0.25], unions: [0, 0.25], liberty: [0.4, 0.85] }, typical: V(.15, .15, .25, .1, .1, .05, .02, .25, .15, .5, .6, .85, .3, .4) },
  { id: 'sortition', name: 'Sortition', rule: 'lottery', hue: '#5fb3a1',
    blurb: 'No parties and no elections: every two years 51 citizens are picked by lottery to make the laws, like jury duty.',
    lock: { liberty: [0.6, 1] }, typical: V(.4, .45, .55, .4, .4, .1, .15, .35, .45, .35, .85, .55, .25, .5) },
  { id: 'developmental', name: 'Developmental state', rule: 'party', hue: '#7f8fa6', faction: 'National Development Party', base: { official: 3, business: 2 }, growth: true,
    blurb: 'One party runs the country like a company: open markets, big projects, fast growth, little freedom.',
    lock: { liberty: [0, 0.35], trade: [0.6, 1], state: [0.2, 0.5], unions: [0, 0.3] }, typical: V(.3, .25, .55, .2, .15, .35, .05, .25, .4, .65, .2, .85, .2, .15) },
  { id: 'ecocommunal', name: 'Eco-communalism', rule: 'assembly', hue: '#8bc34a',
    blurb: 'Self-governing green communes: strict limits on pollution, local co-ops, little trade, everyone votes on each law.',
    lock: { regulation: [0.85, 1], trade: [0, 0.4], coops: [0.5, 1], liberty: [0.7, 1], police: [0, 0.3] }, typical: V(.3, .45, .55, .45, .6, .1, .75, .5, .95, .15, .9, .25, .15, .85) },
  { id: 'federal', name: 'Federal republic', rule: 'elections', hue: '#5c7cfa',
    blurb: 'Elections, with the provinces running most of their own affairs. Regional languages and identities are respected.',
    lock: { autonomy: [0.7, 1], liberty: [0.6, 1] }, typical: V(.35, .35, .45, .35, .35, .1, .05, .35, .4, .4, .85, .6, .3, .85) },
  { id: 'socialrep', name: 'Social republic', rule: 'elections', hue: '#ff8a65',
    blurb: 'Elections, with a constitution that guarantees strong welfare, health, schools and union rights.',
    lock: { welfare: [0.6, 1], services: [0.6, 1], unions: [0.5, 1], liberty: [0.6, 1] }, typical: V(.6, .75, .75, .55, .7, .2, .15, .3, .55, .35, .85, .5, .2, .45) },
  // ---- hybrids, newer orders and personal rule ----
  { id: 'guided', name: 'Guided democracy', rule: 'elections', guided: true, hue: '#7986cb', faction: 'Party of National Unity',
    blurb: 'Elections still happen, but the ruling party owns the TV, the judges and the vote count. Others may run; they almost never win.',
    lock: { liberty: [0.25, 0.55], police: [0.5, 1], autonomy: [0, 0.5] }, typical: V(.35, .4, .5, .35, .25, .25, .05, .3, .4, .7, .4, .5, .35, .25) },
  { id: 'popular', name: 'Popular republic', rule: 'elections', guided: true, hue: '#b3261e', faction: "People's Movement",
    blurb: 'A movement that says it is the voice of the people wins every election, nationalises the big firms and spends on the poor. Critical papers keep getting fined.',
    lock: { welfare: [0.5, 1], state: [0.35, 0.8], unions: [0.3, 0.8], liberty: [0.25, 0.6], trade: [0, 0.5] }, typical: V(.55, .75, .65, .6, .5, .6, .15, .3, .45, .65, .35, .2, .3, .25) },
  { id: 'lanternrep', name: 'Lantern republic', rule: 'elections', hue: '#f8bbd0',
    blurb: 'Free elections, but the elders of the Lantern Church decide who may stand, and every law must respect the faith.',
    lock: { faith: [0.65, 1], liberty: [0.3, 0.65] }, typical: V(.4, .6, .55, .4, .35, .2, .25, .4, .5, .55, .4, .35, .95, .3) },
  { id: 'councilrep', name: 'Council republic', rule: 'councils', hue: '#ff1744',
    blurb: "Elected workers' and neighbourhood councils run the country and vote on each law. Big industry belongs to the public; big owners get no vote.",
    lock: { state: [0.55, 1], unions: [0.6, 1], smallprop: [0, 0.4], liberty: [0.4, 0.8] }, typical: V(.6, .65, .7, .65, .75, .75, .35, .15, .55, .45, .6, .3, .05, .5) },
  { id: 'planned', name: 'Planned commonwealth', rule: 'experts', hue: '#26c6da', faction: 'Central Planning Bureau',
    blurb: 'Planners with a giant computer model run a mostly state-owned economy and pick each law by forecasting what works. No elections, some debate allowed.',
    lock: { state: [0.6, 1], regulation: [0.5, 1], liberty: [0.35, 0.65] }, typical: V(.6, .6, .75, .5, .4, .8, .25, .1, .7, .4, .5, .35, .05, .3) },
  { id: 'corporate', name: 'Corporate state', rule: 'party', hue: '#cfd8dc', faction: 'Council of Directors', base: { owner: 4, business: 3, official: 2 },
    blurb: 'The biggest companies run the country through a board of their directors. Low taxes, no unions, private guards, and a press that pleases its advertisers.',
    lock: { tax: [0, 0.2], unions: [0, 0.1], state: [0, 0.1], regulation: [0, 0.25], smallprop: [0, 0.3], liberty: [0.15, 0.45] }, typical: V(.1, .1, .25, .05, 0, .02, .02, .05, .1, .75, .25, .85, .15, .3) },
  { id: 'elective', name: 'Elective monarchy', rule: 'crown', elective: true, hue: '#d4a373', faction: 'The Electoral Diet', base: { official: 2, owner: 3, small: 2, heritage: 2 },
    blurb: 'A monarch rules for life, but the crown is not inherited: when they die, the great families and the provinces elect the next one. The provinces keep their old rights.',
    lock: { liberty: [0.3, 0.65], autonomy: [0.6, 1], faith: [0.3, 1] }, typical: V(.25, .25, .3, .2, .15, .1, .05, .45, .25, .55, .5, .5, .55, .8) },
  { id: 'personal', name: 'Personal dictatorship', rule: 'party', personal: true, hue: '#8e6c8a', faction: "The Leader's Circle", base: { official: 3, veterans: 2, patriots: 2 },
    blurb: 'One person rules without limits. Their face is on every wall, their friends run the best firms, and nobody knows what happens when they die.',
    lock: { liberty: [0, 0.2], police: [0.75, 1], autonomy: [0, 0.3] }, typical: V(.25, .45, .3, .35, .2, .5, .05, .1, .2, .85, .1, .5, .3, .05) },
];

const NI = IDEOLOGIES.length;
const IDX = {}; IDEOLOGIES.forEach((d, i) => { IDX[d.id] = i; });
IDEOLOGIES.forEach(d => {
  d.electoral = d.rule === 'elections' || d.rule === 'wealth';   // holds elections (a plutocracy weighs votes by wealth)
  d.council = d.rule === 'councils' || d.rule === 'assembly' || d.rule === 'lottery';   // laws voted directly, law by law
  d.lo = new Float32Array(NP).fill(0); d.hi = new Float32Array(NP).fill(1);
  for (const k in d.lock) { d.lo[L[k]] = d.lock[k][0]; d.hi[L[k]] = d.lock[k][1]; }
  if (d.typical.length !== NP) throw new Error('typical for ' + d.id + ' has ' + d.typical.length + ' laws');
});
// systems where a few rule without elections (an elected government sliding toward one of these is "backsliding")
const AUTHORITARIAN = new Set(['communism', 'fascism', 'junta', 'natsynd', 'absmon', 'distmon', 'theocracy', 'technocracy', 'developmental', 'guided', 'popular', 'planned', 'corporate', 'elective', 'personal'].map(id => IDX[id]));
const MONARCHIES = new Set(['absmon', 'constmon', 'distmon', 'elective'].map(id => IDX[id]));
const ANARCHIST = new Set(['anarcom', 'mutualism', 'ecocommunal'].map(id => IDX[id]));
const FAR_RIGHT = new Set(['fascism', 'junta', 'natsynd', 'absmon', 'personal'].map(id => IDX[id]));
const FAR_LEFT = new Set(['communism', 'syndicalism', 'anarcom', 'councilrep'].map(id => IDX[id]));
// guided systems: elections stay but are rigged (the first step of a slide); where a guided system's rulers go when they end elections
const GUIDED = IDEOLOGIES.map((d, k) => d.guided ? k : -1).filter(k => k >= 0);
/** Free elections: electoral, not rigged (guided), not weighted by wealth. */
const isFree = k => IDEOLOGIES[k].electoral && !IDEOLOGIES[k].guided && IDEOLOGIES[k].rule !== 'wealth';
const HARD_TARGETS = [...AUTHORITARIAN].filter(k => !IDEOLOGIES[k].electoral && IDEOLOGIES[k].rule === 'party');

/* Sects: what a party's promises look like, for naming where it has drifted to.
   Law order:  tax, welfare, services, wage, unions, state, coops, smallprop, regulation, police, liberty, trade, faith, autonomy */
const T = id => IDEOLOGIES[IDX[id]].typical;
const FAMILIES = [
  { name: 'Social democrats',       v: V(.5, .6, .65, .55, .55, .15, .1, .3, .55, .4, .85, .55, .2, 0.4) },
  { name: 'Conservatives',          v: V(.25, .25, .35, .2, .15, .1, .02, .35, .3, .65, .65, .5, .55, 0.3) },
  { name: 'Liberals',               v: V(.2, .2, .35, .2, .2, .05, .05, .3, .25, .3, .95, .85, .1, 0.45) },
  { name: 'Social liberals',        v: V(.4, .45, .6, .4, .35, .05, .1, .3, .45, .3, .95, .75, .1, 0.45) },
  { name: 'Classical liberals',     v: V(.15, .1, .25, .05, .1, .02, .05, .35, .15, .35, .95, .95, .2, 0.5) },
  { name: 'Greens',                 v: V(.45, .45, .6, .4, .4, .1, .2, .4, .9, .25, .85, .4, .1, 0.6) },
  { name: 'Eco-socialists',         v: V(.6, .65, .7, .65, .7, .45, .4, .3, .95, .2, .8, .3, .05, 0.6) },
  { name: 'Socialists',             v: V(.6, .6, .7, .7, .7, .5, .25, .3, .6, .35, .75, .35, .1, 0.35) },
  { name: 'Market socialists',      v: V(.5, .55, .6, .55, .6, .2, .8, .3, .5, .3, .8, .6, .1, 0.5) },
  { name: 'Libertarian socialists', v: V(.3, .55, .55, .6, .85, .1, .85, .3, .45, .1, .95, .5, .05, 0.8) },
  { name: 'Left populists',         v: V(.55, .75, .7, .75, .65, .35, .2, .3, .45, .5, .6, .25, .3, 0.3) },
  { name: 'Right populists',        v: V(.2, .45, .45, .4, .2, .15, .05, .35, .25, .8, .5, .2, .55, 0.3) },
  { name: 'Nationalists',           v: V(.35, .35, .35, .35, .2, .2, .02, .3, .35, .85, .35, .15, .55, 0.1) },
  { name: 'Social conservatives',   v: V(.35, .45, .45, .35, .3, .15, .1, .4, .45, .6, .6, .45, .7, 0.35) },
  { name: 'Religious democrats',    v: V(.35, .45, .5, .35, .4, .1, .1, .4, .45, .45, .75, .55, .75, 0.45) },
  { name: 'Agrarians',              v: V(.3, .4, .4, .3, .3, .15, .4, .8, .3, .45, .65, .2, .55, 0.6) },
  { name: 'Centrists',              v: T('democracy') },
  { name: 'Communists',             v: T('communism') },
  { name: 'Syndicalists',           v: T('syndicalism') },
  { name: 'Anarcho-communists',     v: T('anarcom') },
  { name: 'Mutualists',             v: T('mutualism') },
  { name: 'Distributists',          v: T('distributism') },
  { name: 'Monarcho-distributists', v: T('distmon') },
  { name: 'Constitutional monarchists', v: T('constmon') },
  { name: 'Absolute monarchists',   v: T('absmon') },
  { name: 'National syndicalists',  v: T('natsynd') },
  { name: 'Fascists',               v: T('fascism') },
  { name: 'Theocrats',              v: T('theocracy') },
  { name: 'Technocrats',            v: T('technocracy') },
  { name: 'Free-marketeers',        v: T('freemarket') },
  { name: 'Militarists',            v: T('junta') },
  { name: 'Plutocrats',             v: T('plutocracy') },
  { name: 'Sortitionists',          v: T('sortition') },
  { name: 'Developmentalists',      v: T('developmental') },
  { name: 'Eco-communalists',       v: T('ecocommunal') },
  { name: 'Federalists',            v: T('federal') },
  { name: 'Social republicans',     v: T('socialrep') },
  { name: 'Regionalists',           v: V(.35, .4, .45, .35, .35, .1, .15, .4, .45, .35, .75, .45, .35, .95) },
  { name: 'Religious socialists',   v: V(.55, .7, .65, .6, .6, .3, .25, .35, .5, .4, .7, .4, .7, .4) },
  { name: 'Anarcho-capitalists',    v: V(0, 0, .05, 0, .05, 0, .05, .4, 0, .1, 1, 1, .15, .7) },
  { name: 'Paleoconservatives',     v: V(.3, .35, .35, .3, .2, .15, .05, .45, .35, .6, .55, .15, .75, .3) },
  { name: 'Communitarians',         v: V(.4, .55, .55, .4, .5, .1, .55, .6, .5, .45, .6, .35, .6, .85) },
  { name: 'Technoprogressives',     v: V(.45, .4, .85, .4, .35, .15, .1, .25, .5, .3, .9, .75, .05, .4) },
  { name: 'Guided democrats',       v: T('guided') },
  { name: 'Left nationalists',      v: T('popular') },
  { name: 'Lantern republicans',    v: T('lanternrep') },
  { name: 'Council communists',     v: T('councilrep') },
  { name: 'Cybernetic planners',    v: T('planned') },
  { name: 'Corporatocrats',         v: T('corporate') },
  { name: 'Elective monarchists',   v: T('elective') },
  { name: 'Strongman loyalists',    v: T('personal') },
  { name: 'Ordoliberals',           v: V(.3, .25, .45, .25, .3, .05, .05, .6, .65, .4, .85, .9, .3, .45) },
  { name: 'Protectionists',         v: V(.4, .45, .5, .5, .45, .4, .1, .35, .5, .6, .6, .05, .35, .2) },
  { name: 'Green conservatives',    v: V(.35, .4, .45, .3, .25, .1, .2, .55, .8, .55, .65, .3, .5, .55) },
  { name: 'Welfare nationalists',   v: V(.45, .7, .6, .45, .35, .2, .05, .3, .4, .75, .55, .2, .45, .2) },
  { name: 'Deep greens',            v: V(.05, .2, .2, .1, .2, 0, .5, .7, 1, .05, .8, 0, .3, 1) },
  { name: 'Cantonalists',           v: V(.2, .2, .35, .15, .2, .05, .1, .5, .2, .25, .9, .7, .3, 1) },
  { name: 'Centralists',            v: V(.35, .35, .55, .35, .35, .2, .05, .3, .5, .55, .85, .6, .25, 0) },
  { name: 'Landed conservatives',   v: V(.1, .1, .15, 0, 0, .05, .02, 0, .15, .65, .4, .3, .6, .7) },
  { name: 'State capitalists',      v: V(.45, .4, .6, .3, .2, .65, .05, .15, .55, .6, .4, .7, .1, .2) },
  { name: 'Solidarists',            v: V(.45, .6, .6, .5, .5, .15, .35, .5, .5, .4, .75, .45, .45, .55) },
  { name: 'Secular nationalists',   v: V(.45, .4, .6, .4, .3, .4, .05, .25, .5, .7, .45, .35, 0, .05) },
];
FAMILIES.forEach(f => { if (f.v.length !== NP) throw new Error('sect ' + f.name + ' has ' + f.v.length + ' laws'); });

/* ---------------- communities ----------------
   Everyday communities and street movements. Citizens join when a community fits them,
   stay while membership is worth it (belonging, ideals) and leave when it costs too much.
   Members talk mostly with each other. */
const COMMUNITIES = [
  { id: 'church',     name: 'The Lantern Church',     kind: 'everyday', blurb: "Veyland's old faith: weekly gatherings, charity, a moral voice." },
  { id: 'unionclub',  name: "Workers' clubs",         kind: 'everyday', blurb: 'Union halls, brass bands and football teams of working people.' },
  { id: 'farmcoop',   name: "Farmers' co-ops",        kind: 'everyday', blurb: 'Farmers and village craftspeople who share machines, markets and gossip.' },
  { id: 'students',   name: 'Student societies',      kind: 'everyday', blurb: 'Young people arguing about how the world should be.' },
  { id: 'business',   name: 'Business clubs',         kind: 'everyday', blurb: 'Owners and managers networking over long dinners.' },
  { id: 'veterans',   name: "Veterans' associations", kind: 'everyday', blurb: 'Former soldiers and police, proud of their service.' },
  { id: 'newcomers',  name: "Newcomers' associations", kind: 'everyday', blurb: 'Immigrants helping each other settle in.' },
  { id: 'antifa',     name: 'Anti-fascist Action',    kind: 'movement', blurb: 'Activists who confront far-right groups in the street and defend against strongmen.' },
  { id: 'patriots',   name: 'Patriotic militias',     kind: 'movement', blurb: 'Armed nationalist groups who want order, the nation first, and a strong hand.' },
  { id: 'redguards',  name: "Workers' militias",      kind: 'movement', blurb: 'Armed left-wing groups who want the workers to take power.' },
  { id: 'greens',     name: 'Green activists',        kind: 'movement', blurb: 'Campaigners for clean air, rivers and forests.' },
  { id: 'sports',     name: 'Sports clubs',           kind: 'everyday', blurb: 'Football, rowing and darts: belonging without politics.' },
  { id: 'heritage',   name: 'Heritage societies',     kind: 'everyday', blurb: 'People keeping their province\'s dialect, songs and festivals alive.' },
  { id: 'separatists', name: 'Independence movements', kind: 'movement', blurb: 'People who want their province to leave Veyland and become a country of its own.' },
  { id: 'peace',      name: 'Peace movement',         kind: 'movement', blurb: 'Marches and vigils against war and the arms race.' },
  { id: 'revivalists', name: 'Lantern revivalists',   kind: 'movement', blurb: 'Devout believers who want the faith back at the heart of public life.' },
  { id: 'secularists', name: 'Secular league',        kind: 'movement', blurb: 'Campaigners to keep the church out of schools, courts and law.' },
  { id: 'monarchists', name: 'Monarchist leagues',    kind: 'movement', blurb: 'People who want a crown at the head of the nation.' },
  { id: 'blackbloc',  name: 'Anarchist black bloc',   kind: 'movement', blurb: 'Masked anarchists who fight police and fascists in the street.' },
  { id: 'taxrevolt',  name: 'Tax revolt league',      kind: 'movement', blurb: 'Shopkeepers, owners and others who refuse to pay what they call theft.' },
];
// movements that bring weapons to an uprising
const ARMED = new Set(['patriots', 'redguards', 'blackbloc', 'separatists']);
const NCOM = COMMUNITIES.length;
const CIDX = {}; COMMUNITIES.forEach((m, i) => { CIDX[m.id] = i; });

function familyOf(platform) {
  let best = null, bd = Infinity;
  for (const f of FAMILIES) {
    let d = 0; for (let p = 0; p < NP; p++) d += (platform[p] - f.v[p]) ** 2;
    if (d < bd) { bd = d; best = f; }
  }
  return best.name;
}

/* ---------------- the map ---------------- */
/* Provinces, each with its own culture: dialect, festival, folk hero, how religious it is,
   what its people tend to value, early hunches, and how strongly it feels like a people of its own. */
const REGIONS = [
  { name: 'Oldbridge', kind: 'the capital',      x: .47, y: .44, industry: .3, bias: { owner: 2.5, small: .6, official: 2.4 },
    culture: { people: 'Oldbridgers', dialect: 'Standard Veylish', festival: "Founders' Day", hero: 'Marra Ostlin, who wrote the first charter',
      faith: .3, identity: .1, values: { Freedom: 1.2, Money: 1.15 }, hunch: { liberty: .04, services: .02 } } },
  { name: 'Ironvale',  kind: 'factory towns',    x: .70, y: .30, industry: .9, bias: { owner: 1.2, small: .5, official: .7 },
    culture: { people: 'Ironvalers', dialect: 'Ironvale cant', festival: 'Furnace Night', hero: 'Tobin Kell, who led the great strike',
      faith: .35, identity: .35, values: { Fairness: 1.25, Dignity: 1.2 }, hunch: { unions: .05, wage: .04 } } },
  { name: 'Redfield',  kind: 'farmland',         x: .28, y: .66, industry: .1, bias: { owner: .6, small: 2.6, official: .6 },
    culture: { people: 'Redfielders', dialect: 'Redfield burr', festival: 'the Harvest Fair', hero: 'Old Mother Asper, who fed the valley through the famine',
      faith: .65, identity: .45, values: { Belonging: 1.25, Money: 1.05 }, hunch: { smallprop: .05, faith: .03, trade: -.03 } } },
  { name: 'Saltmere',  kind: 'a port',           x: .76, y: .68, industry: .5, bias: { owner: 1.4, small: .9, official: 1 },
    culture: { people: 'Saltmerers', dialect: 'the Harbour tongue', festival: 'the Feast of Tides', hero: 'Captain Wren Holt, who opened the sea roads',
      faith: .35, identity: .35, values: { Freedom: 1.15, Money: 1.2 }, hunch: { trade: .06, liberty: .02 } } },
  { name: 'Highcombe', kind: 'mining hills',     x: .30, y: .25, industry: .8, bias: { owner: .7, small: .6, official: .7 },
    culture: { people: 'Combers', dialect: 'Old Combish, a language of its own', festival: 'the Lamp Festival', hero: "Brannoc of the Pits, the miners' rebel",
      faith: .5, identity: .7, values: { Dignity: 1.25, Belonging: 1.2, Fairness: 1.15 }, hunch: { regulation: .05, autonomy: .06 } } },
  { name: 'Fenwick',   kind: 'forest villages',  x: .52, y: .82, industry: .15, bias: { owner: .4, small: 2.2, official: .6 },
    culture: { people: 'Fenfolk', dialect: 'Fen speech', festival: 'Midwinter in the Woods', hero: 'Elsa Varnby, keeper of the old forests',
      faith: .6, identity: .45, values: { Health: 1.15, Belonging: 1.2 }, hunch: { regulation: .05, autonomy: .03 } } },
];
const NR = REGIONS.length;

/* ---------------- kinds of party ----------------
   What a party is FOR and WHOM it speaks for.
   core: the few laws it will not give up (its "lane"); family: the sect its other promises start from;
   base: who feels it is "one of us" (cls: class, comm: communities, reg: provinces, firm: workplace,
   rel: religiosity (negative = the unbelieving), young / old, immigrant, jobless, unhappy);
   enemies: parties it will not govern with; aim: the system an anti-system party campaigns for. */
const ARCHETYPES = [
  { id: 'labour', label: 'Labour', family: 'Social democrats', core: { wage: .65, unions: .7, welfare: .6 },
    base: { cls: { worker: 1, retired: .3 }, comm: { unionclub: 1.5 }, reg: { Ironvale: .4, Highcombe: .4 } },
    names: ['Veyland Labour', 'Party of the Forge', "Workers' Commonwealth", 'Hearth and Hammer', 'Social Labour Union', 'Furnace Labour'], enemies: ['business', 'antitax', 'iron'] },
  { id: 'socialist', label: 'Socialists', family: 'Socialists', coup: 'communism', core: { state: .65, tax: .65, wage: .75 },
    base: { cls: { worker: .7 }, jobless: .5, comm: { redguards: 1.5, unionclub: .8, students: .6 } },
    names: ['Commons Party', 'Red Furnace League', 'Party of Common Ownership', 'Socialist Commonwealth'], enemies: ['business', 'antitax', 'nationalist', 'iron'] },
  { id: 'revolutionary', label: 'Revolutionary communists', family: 'Communists', coup: 'communism', core: { state: .9, coops: .05, liberty: .3, faith: .05 }, aim: 'communism',
    base: { comm: { redguards: 2.5, students: .4 }, jobless: .8, cls: { worker: .3 }, unhappy: .6 },
    names: ["Workers' Vanguard", 'Red Dawn Party', 'Party of the Commune', 'Revolutionary Workers League'], enemies: ['business', 'conservative', 'nationalist', 'iron', 'church', 'monarchist', 'antitax'] },
  { id: 'syndicalist', label: 'Syndicalists', family: 'Syndicalists', core: { unions: .95, coops: .8, state: .15 }, aim: 'syndicalism',
    base: { comm: { unionclub: 1.2, redguards: .8, blackbloc: .8 }, cls: { worker: .4 }, firm: { coop: .6 } },
    names: ['One Big Union Party', 'Party of the General Strike', 'Syndicalist Union', 'Black and Red League'], enemies: ['business', 'antitax', 'iron'] },
  { id: 'coop', label: 'Co-operativists', family: 'Market socialists', core: { coops: .75, unions: .6, smallprop: .35 },
    base: { cls: { worker: .4 }, comm: { unionclub: .6, students: .5, farmcoop: .5 }, firm: { coop: 1.2 } },
    names: ['Co-operative Union', 'Mutual Aid Party', 'Party of the Guildhalls', 'Shared Work League'], enemies: ['business'] },
  { id: 'business', label: 'Business party', family: 'Liberals', coup: 'developmental', core: { tax: .18, regulation: .2, trade: .85, unions: .15 },
    base: { cls: { owner: 2, official: .2 }, comm: { business: 2 }, reg: { Saltmere: .3, Oldbridge: .3 } },
    names: ['Enterprise Party', 'Free Trade League', 'Chamber Party', 'Party of Commerce', 'Harbour Liberals'], enemies: ['socialist', 'labour', 'revolutionary', 'syndicalist'] },
  { id: 'liberal', label: 'Civic liberals', family: 'Social liberals', core: { liberty: .95, faith: .1, trade: .7 },
    base: { comm: { students: .8, secularists: 1.2, newcomers: .5 }, reg: { Oldbridge: .5, Saltmere: .3 }, rel: -.4 },
    names: ['Civic Liberals', 'Open Society Party', "Free Citizens' Union", 'Oldbridge Liberals'], enemies: ['nationalist', 'church', 'iron', 'theocrat'] },
  { id: 'conservative', label: 'Conservatives', family: 'Conservatives', coup: 'junta', core: { police: .6, tax: .3, faith: .45 },
    base: { cls: { owner: .8, small: .5, retired: .5, official: .4 }, comm: { veterans: .6, church: .4 }, rel: .4 },
    names: ['Conservative Union', 'Old Charter Party', 'Party of Order and Hearth', 'Veyland Conservatives'], enemies: ['socialist', 'revolutionary', 'syndicalist'] },
  { id: 'church', label: 'Lantern democrats', family: 'Religious democrats', coup: 'theocracy', core: { faith: .75, welfare: .5 },
    base: { comm: { church: 1.2, revivalists: 2 }, reg: { Redfield: .3, Fenwick: .3 }, rel: 1.2 },
    names: ["Lantern People's Party", 'Lantern Democrats', 'Party of the Lamp', 'Lantern Union'], enemies: ['secular', 'liberal', 'revolutionary'] },
  { id: 'theocrat', label: 'Lantern restorationists', family: 'Theocrats', coup: 'theocracy', core: { faith: .95, liberty: .35 }, aim: 'theocracy',
    base: { comm: { revivalists: 2.5, church: .6 }, rel: .8, unhappy: .3 },
    names: ['Party of the Holy Lamp', 'Lantern Restoration', 'Covenant Party', 'Keepers of the Flame'], enemies: ['secular', 'liberal', 'revolutionary', 'technocrat'] },
  { id: 'agrarian', label: 'Agrarians', family: 'Agrarians', coup: 'distmon', core: { smallprop: .8, trade: .25, autonomy: .55 },
    base: { cls: { small: 1.5 }, comm: { farmcoop: 2 }, reg: { Redfield: .7, Fenwick: .7 } },
    names: ['Rural League', 'Plough and Hearth', "Smallholders' Party", 'Party of the Fields', 'Harvest League'], enemies: ['business'] },
  { id: 'green', label: 'Greens', family: 'Greens', core: { regulation: .9, trade: .4 },
    base: { comm: { greens: 2, students: .8, peace: .6 }, young: .5, reg: { Fenwick: .3 } },
    names: ['Green Alliance', 'Party of the Forests', 'Clean Rivers League', 'Living Land Party'], enemies: ['business', 'antitax'] },
  { id: 'nationalist', label: 'Nationalists', family: 'Nationalists', coup: 'fascism', core: { police: .8, trade: .2, autonomy: .1 },
    base: { comm: { patriots: 2, veterans: 1 }, cls: { official: .3 }, jobless: .3 },
    names: ['Veyland First', 'Homeland Party', 'Patriotic Union', 'Banner of Veyland'], enemies: ['regionalist', 'liberal', 'socialist', 'newcomer', 'revolutionary'] },
  { id: 'iron', label: 'National renewal (far right)', family: 'Fascists', coup: 'fascism', core: { police: .95, unions: .05, liberty: .15, autonomy: .05 }, aim: 'fascism',
    base: { comm: { patriots: 2.5, veterans: .6 }, jobless: .6, cls: { official: .3 }, unhappy: .6 },
    names: ['National Renewal Front', 'Iron Banner Movement', 'Veyland Reborn', 'The Hard Dawn'], enemies: ['liberal', 'socialist', 'revolutionary', 'labour', 'newcomer', 'regionalist', 'secular', 'syndicalist'] },
  { id: 'order', label: 'Law and order', family: 'Right populists', coup: 'junta', core: { police: .8, welfare: .45 },
    base: { comm: { veterans: 2 }, cls: { official: 1, retired: .3 } },
    names: ["Veterans' League", 'Shield Party', 'Order and Safety Party'], enemies: ['liberal', 'revolutionary'] },
  { id: 'populist', label: 'Anti-establishment populists', family: 'Left populists', coup: 'personal', core: { welfare: .65, trade: .25, police: .6 },
    base: { unhappy: 1.5, jobless: .8, young: .3 },
    names: ["People's Voice", 'Clean Hands Movement', 'Enough!', 'Party of the Ordinary People'], enemies: ['business'] },
  { id: 'pensioner', label: 'Pensioners', family: 'Left populists', core: { welfare: .8, services: .7 },
    base: { cls: { retired: 2 }, old: .5 },
    names: ["Pensioners' Party", 'Silver League', 'Grey Alliance'], enemies: ['antitax'] },
  { id: 'antitax', label: 'Anti-tax', family: 'Classical liberals', core: { tax: .05, regulation: .15, state: .03 },
    base: { comm: { taxrevolt: 2.5 }, cls: { small: .6, owner: .6 } },
    names: ["Taxpayers' Revolt", 'Party of the Purse', 'Low Tax League', 'No Tithes Party'], enemies: ['socialist', 'labour', 'pensioner', 'revolutionary'] },
  { id: 'secular', label: 'Secular radicals', family: 'Social liberals', core: { faith: .03, liberty: .9, services: .65 },
    base: { comm: { secularists: 2, students: .8 }, rel: -.8 },
    names: ['Secular Radicals', 'Party of Reason', 'Free Thought League'], enemies: ['church', 'theocrat', 'monarchist'] },
  { id: 'technocrat', label: 'Modernisers', family: 'Technoprogressives', coup: 'technocracy', core: { services: .85, regulation: .55, trade: .7 },
    base: { comm: { students: 1 }, cls: { official: .5, owner: .3 }, reg: { Oldbridge: .4 } },
    names: ['Progress Party', 'Future Veyland', 'Modern Veyland Union'], enemies: ['theocrat'] },
  { id: 'monarchist', label: 'Monarchists', family: 'Constitutional monarchists', coup: 'absmon', core: { faith: .5, police: .6 }, aim: 'constmon',
    base: { comm: { monarchists: 2.5 }, rel: .3, old: .3 },
    names: ['Crown Party', 'Loyalists of the Crown', 'Royal League'], enemies: ['secular', 'socialist', 'revolutionary'] },
  { id: 'peace', label: 'Peace party', family: 'Greens', core: { police: .25 }, peace: true,
    base: { comm: { peace: 2.5, students: .4 } },
    names: ['Peace Party', 'Olive League', 'Party of the White Dove'], enemies: ['nationalist', 'iron'] },
  { id: 'newcomer', label: 'New citizens', family: 'Social liberals', core: { trade: .75, liberty: .85, faith: .2 },
    base: { comm: { newcomers: 2.5 }, immigrant: 1 },
    names: ["New Citizens' Party", 'Open Doors League'], enemies: ['nationalist', 'iron'] },
  { id: 'regionalist', label: 'Regionalists', family: 'Regionalists', core: { autonomy: .9 }, regional: true,
    base: { comm: { heritage: 2, separatists: 2 } }, names: [], enemies: ['nationalist', 'iron'] },
];
const NAR = ARCHETYPES.length;
const AIDX = {}; ARCHETYPES.forEach((a, i) => { AIDX[a.id] = i; });
ARCHETYPES.forEach(a => {
  a.lane = Object.keys(a.core).map(k => L[k]); a.laneVal = Object.values(a.core);
  const f = FAMILIES.find(x => x.name === a.family); if (!f) throw new Error('kind of party ' + a.id + ': no sect ' + a.family);
  a.ideal = Float32Array.from(f.v); for (const k in a.core) a.ideal[L[k]] = a.core[k];
  for (const e of a.enemies) if (!(e in AIDX)) throw new Error('kind of party ' + a.id + ': unknown enemy ' + e);
  // the base, unpacked for speed
  const b = a.base;
  a.bComm = b.comm ? Object.keys(b.comm) : []; a.bCommW = a.bComm.map(id => b.comm[id]);
  for (const id of a.bComm) if (!COMMUNITIES.some(m => m.id === id)) throw new Error('kind of party ' + a.id + ': unknown community ' + id);
  a.bReg = REGIONS.map(x => (b.reg && b.reg[x.name]) || 0);
});
ARCHETYPES.forEach(a => {
  a.aimIdx = a.aim ? IDX[a.aim] : null; if (a.aim && a.aimIdx == null) throw new Error('kind of party ' + a.id + ': unknown aim ' + a.aim);
  a.coupIdx = a.coup ? IDX[a.coup] : null; if (a.coup && a.coupIdx == null) throw new Error('kind of party ' + a.id + ': unknown coup ' + a.coup);
});
// kinds of party on the left (an eroding one of these turns a democracy into a popular republic rather than a guided democracy)
const LEFT_KINDS = new Set(['labour', 'socialist', 'revolutionary', 'syndicalist', 'coop', 'populist', 'pensioner', 'green', 'peace']);
const enemies = (a, b) => !!(a && b && (ARCHETYPES[AIDX[a]].enemies.includes(b) || ARCHETYPES[AIDX[b]].enemies.includes(a)));
/** Where a set of promises sits on two simple axes: economy (0 = free market, 1 = state & unions) and authority (0 = free, 1 = controlled). */
function axes(v) {
  const econ = (v[L.tax] + v[L.welfare] + v[L.wage] + v[L.unions] + v[L.state] + v[L.coops] + v[L.regulation] + (1 - v[L.trade])) / 8;
  const auth = (v[L.police] + v[L.faith] + (1 - v[L.liberty]) + (1 - v[L.autonomy])) / 4;
  return [econ, auth];
}


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
const ENV = typeof process !== 'undefined' && process.env ? process.env : {};
const VOTE_CAUTION = +(ENV.VC ?? 0.04);  // at the ballot box a change of law feels less risky than in daily life (a promise is not yet a law)
const LANE = 0.12;          // how far a party may stray from its core beliefs on the laws it was founded for
const PURITY = 0.5;         // how much party activists punish candidates who drift from what the party stands for
const SYM_W = +(ENV.SYM ?? 0.6), AFF_W = +(ENV.AFF ?? 0.5), PID_W = +(ENV.PID ?? 0.6), BASE_W = 0.6;   // what the party stands for · "one of us" · voting habit · the home base in primaries
const SOFT_COUP = +(ENV.SOFT ?? 0.7);   // how far a democracy erodes before its rulers rewrite the constitution (at 1 they end elections)
const FATIGUE = +(ENV.FAT ?? 0.08), FATIGUE_MAX = +(ENV.FATMAX ?? 0.6);   // "time for a change": voters tire of a party that has governed for years

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
    this.P = Float32Array.from([.35, .3, .4, .3, .3, .1, .05, .3, .4, .4, .75, .5, .35, .35]);
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
    // communities: members of each (rebuilt monthly), share of each movement out on the street, whom each endorses
    this.members = {}; this.commActive = {}; this.endorse = {}; this.lastClash = new Float32Array(NR).fill(-99);
    // democratic backsliding: how far an elected strongman has eroded the rules (1 = elections suspended)
    this.erosion = 0; this.erosionBy = null; this.monarch = null;
    this.dominant = null;   // guided systems: the ruling party that always gets a head start
    // fragile democracy: hard times, gridlock, emergency rule, the army's mood; the democracy that fell (so it can come back)
    this.crisis = 0; this.gridlock = 0; this.emergency = null; this.erosionWhy = null; this.erosionTo = -1; this.fear = 0;
    this.army = { plot: 0, mood: 0, weak: 0, warned: -999, purged: -999, last: -999, backers: {} };
    this.fallen = null; this.slump = 0; this.terror = -999;
    // provinces: 'province', 'autonomous' (its own assembly and language rights) or 'independent' (left Veyland)
    this.regionStatus = REGIONS.map(() => 'province');
    this.indepSupport = new Float32Array(NR); this.boom = new Float32Array(NR); this.langBan = new Float32Array(NR);
    this.secessionRun = new Float32Array(NR); this.independence = []; this.assembly = [];

    this.N0 = this.N;
    this.citizens = []; this.freeHomes = []; this.nextHome = 0;
    for (let i = 0; i < this.N; i++) { const c = this._newCitizen(null, 18 + this.rng() * 62); c.home = this.nextHome++; this.citizens.push(c); }
    this._reconcileClasses(true);

    this.lobbies = [
      { id: 'industry', name: 'Industry Council', cls: 'owner', money: 0, q: new Float32Array(4 * NLA), last: null, top: 0, dir: 0, sBefore: 0, log: [] },
      { id: 'unions', name: "Workers' Federation", cls: 'worker', money: 0, q: new Float32Array(4 * NLA), last: null, top: 0, dir: 0, sBefore: 0, log: [] },
      { id: 'small', name: "Smallholders' League", cls: 'small', money: 0, q: new Float32Array(4 * NLA), last: null, top: 0, dir: 0, sBefore: 0, log: [] },
    ];

    for (let t = 0; t < 6; t++) this._communities(true);   // people find their communities first, so founders know whom they speak for
    const start = IDX[opts.start] ?? IDX.democracy;
    if (IDEOLOGIES[start].electoral) {
      this.regime = start;
      if (IDEOLOGIES[start].monarch) this.monarch = this._newMonarch();
      this._foundPartySystem(6);
      if (IDEOLOGIES[start].guided) this.dominant = this.parties[0].id;
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
    if (this.regionStatus && !this.inVeyland(region)) region = REGIONS.findIndex((x, k) => this.inVeyland(k));
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
      religious: r() < (REGIONS[region].culture.faith) ? 0.5 + 0.5 * r() : 0.15 * r(),   // how much faith matters to them
      culture: region,   // the province whose culture they grew up in (-1 = from abroad)
      identity: clamp(REGIONS[region].culture.identity + r.gauss() * 0.15, 0, 1),   // how much they feel like one of their province's people
      indep: -0.3,       // how much they want their province to become independent (computed from what they feel)
      comm: {},          // communities they belong to: id -> how much membership seems worth to them (learned)
      veteran: false,
      pid: null, pidArch: null, pidS: 0,   // party loyalty: a habit of voting for one party (or one of its kind)
      aff: new Float32Array(NAR),          // how much each kind of party feels like "one of us"
    };
    for (let k = 0; k < NN; k++) c.values[k] = clamp(1 + r.gauss() * 0.4, 0.2, 1.8);
    for (let p = 0; p < NW; p++) c.w[p] = r.gauss() * 0.03;               // hunches, not knowledge
    this._acculturate(c, region);
    for (let a = 1; a < NA; a++) c.q[a * NF] = -ACTION_COST[a];   // wary of trouble at first
    if (parent) {
      // children grow up hearing their parent's views and stories, but make up their own minds
      for (let p = 0; p < NW; p++) c.w[p] = parent.w[p] * 0.6 + r.gauss() * 0.05;
      c.abroad = parent.abroad;
      c.religious = clamp(parent.religious * 0.75 + c.religious * 0.25, 0, 1);   // raised in (or out of) the faith
      // children mostly take their parents' culture, unless the family settled elsewhere
      if (parent.culture !== region && r() < 0.5) { c.culture = region; c.identity = clamp(REGIONS[region].culture.identity * 0.6 + r.gauss() * 0.1, 0, 1); }
      else { c.culture = parent.culture; c.identity = clamp(parent.identity * 0.8 + r.gauss() * 0.08, 0, 1); }
      for (let k = 0; k < NI; k++) c.memory[k] = parent.memory[k];
      for (let k = 0; k < NN; k++) c.values[k] = clamp(parent.values[k] * 0.5 + c.values[k] * 0.5, 0.2, 1.8);
      for (let i = 0; i < c.q.length; i++) c.q[i] = c.q[i] * 0.7 + parent.q[i] * 0.3;
      for (const id in parent.trust) c.trust[id] = parent.trust[id] * 0.5;
      if (parent.pid && r() < 0.7) { c.pid = parent.pid; c.pidArch = parent.pidArch; c.pidS = 0.5 * parent.pidS; }   // raised in a Labour (or Lantern...) household
      if ((parent.cls === 'owner' || parent.cls === 'small') && r() < 0.7) c.cls = parent.cls;
      c.wealthF = parent.wealthF * 0.7 + c.wealthF * 0.3;
      c.s = parent.s; c.sHist.fill(parent.s); c.sRef = parent.s;
    }
    if (age >= 65) c.cls = 'retired';
    for (const party of this.parties) if (!(party.id in c.trust)) c.trust[party.id] = r.gauss() * 0.1;
    return c;
  }

  /** A culture's tilt on what someone values and their first hunches. */
  _acculturate(c, k) {
    if (k < 0) return;
    const cu = REGIONS[k].culture;
    for (const nm in cu.values) c.values[NEEDS.indexOf(nm)] = clamp(c.values[NEEDS.indexOf(nm)] * cu.values[nm], 0.2, 2);
    for (const id in cu.hunch) c.w[L[id]] += cu.hunch[id];
  }
  /** How much the provinces (and this one) run their own affairs. */
  autonomyOf(k) { return this.regionStatus[k] === 'autonomous' ? Math.max(0.85, this.P[L.autonomy]) : this.P[L.autonomy]; }
  inVeyland(k) { return this.regionStatus[k] !== 'independent'; }

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
    const rs = { pay: new Float32Array(NR), pop: new Float32Array(NR), unemp: new Float32Array(NR), wk: new Float32Array(NR), natPay: this.meanIncome };
    for (const c of cits) { rs.pay[c.region] += c.net; rs.pop[c.region]++; if (c.cls === 'worker') { rs.wk[c.region]++; if (!c.employed) rs.unemp[c.region]++; } }
    for (let k = 0; k < NR; k++) { rs.pay[k] /= Math.max(1, rs.pop[k]); rs.unemp[k] /= Math.max(1, rs.wk[k]); }
    this.regionStats = rs;
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
    n[0] = clamp(1 - Math.exp(-net / REF) - (snap ? 0 : 0.3 * this.hurt[c.region] - 0.25 * this.boom[c.region]), 0, 1);
    const pollution = (1 - P[L.regulation]) * REGIONS[c.region].industry * 0.5;
    n[1] = clamp(0.2 + 0.45 * P[L.services] + 0.25 * n[0] - pollution, 0, 1);
    const war = !snap && this.war ? 0.15 + 0.15 * Math.max(0, -this.war.score) : 0;   // bombs, shortages, fear of losing
    const hurt = snap ? 0 : this.hurt[c.region];                     // a recent disaster here: loss, fear, rebuilding
    n[2] = clamp(1 - crime * 1.5 - war - 0.6 * hurt, 0, 1);
    // a church-run public life feels like a cage to the unbelieving, and like home to the faithful
    n[3] = jailed ? 0 : clamp(Math.pow(P[L.liberty], 0.7) - 0.3 * P[L.police] * (1 - P[L.liberty]) - 0.3 * P[L.faith] * (1 - c.religious), 0, 1);
    n[4] = clamp(1 - gini * 1.3 - 0.6 * (snap ? snap.C : this.C), 0, 1);
    let d;
    if (jailed) d = 0;
    else if (c.cls === 'worker') d = employed ? 0.3 + 0.3 * P[L.unions] + 0.2 * P[L.wage] + (c.firm === 'coop' ? 0.25 : 0) : 0.1 + 0.2 * P[L.welfare];
    else if (c.cls === 'small') d = 0.8; else if (c.cls === 'owner') d = 0.85; else if (c.cls === 'official') d = 0.7; else d = 0.6;
    n[5] = clamp(d + 0.15 * P[L.faith] * c.religious - 0.1 * (1 - P[L.faith]) * c.religious, 0, 1);
    // belonging: family and friends, plus the communities they are part of
    const k = c.comm ? Object.keys(c.comm).length : 0;
    // a strong regional identity: at home when the province runs its own affairs, ruled by outsiders when it does not
    const home = c.culture === c.region ? 1 : 0.3, idn = (c.identity || 0) * home;
    const auto = snap ? P[L.autonomy] : this.autonomyOf(c.region);
    n[6] = jailed ? 0.1 : clamp(0.3 + [0, 0.25, 0.45, 0.55][Math.min(3, k)] - (c.immigrant && !k ? 0.15 : 0) + 0.15 * idn * (auto - 0.4), 0, 1);
    n[3] = clamp(n[3] - 0.15 * idn * Math.max(0, 0.4 - auto) - (snap ? 0 : 0.25 * idn * (this.langBan[c.region] > 0 ? 1 : 0)), 0, 1);
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

  /** Regional identity drifts, and with it the wish for independence. */
  _identity(c) {
    const k = c.region, P = this.P, st = this.regionStats;
    if (c.culture < 0) { c.identity = Math.max(0, c.identity - 0.002); c.indep = -0.5; return; }
    const homeland = c.culture === k;
    let d = 0.03 * (REGIONS[c.culture].culture.identity - c.identity);          // a culture's own pull: identity drifts back to what is normal there
    d -= 0.004 * (0.5 + P[L.services]) * 0.5;                                    // national schools and media slowly blend people in
    if (!homeland) d -= 0.01;                                                    // living elsewhere, people assimilate
    if (c.comm && c.comm.heritage != null) d += 0.004;                           // keeping the dialect and festivals alive
    if (homeland && this.langBan[k] > 0) d += 0.02;                              // banning a language makes people cling to it
    if (homeland && st && st.pay[k] < 0.85 * st.natPay) d += 0.006;               // "the capital takes our wealth"
    if (homeland && this.autonomyOf(k) < 0.3) d += 0.003;
    c.identity = clamp(c.identity + d, 0, 1);
    if (!homeland || !this.inVeyland(k)) { c.indep = -0.4 - 0.3 * (1 - c.identity); return; }
    // want independence? strong identity, grievance and being ruled from far away push for it; autonomy, fear of the unknown and ties pull against it
    const rich = st ? (st.pay[k] - st.natPay) / Math.max(1, st.natPay) : 0;
    // (richer provinces resent paying for the rest; poorer ones resent being left behind)
    c.indep = clamp(1.2 * c.identity - 0.85 + 0.4 * Math.abs(rich) * (rich > 0 ? 1 : 1.5) * c.identity
      - 0.4 * this.autonomyOf(k) * c.identity + (this.langBan[k] > 0 ? 0.25 : 0) + (c.fav !== this.regime ? 0.05 : 0) + 0.05 * this.rng.gauss(), -1, 1);
  }
  _features(c, local, rep, out) {
    out[0] = 1; out[1] = 0.5 - c.s; out[2] = local; out[3] = rep;
    out[4] = Math.max(c.fav !== this.regime ? clamp(c.favScore, 0, 1) : 0, c.comm && c.comm.separatists != null ? clamp(c.indep, 0, 1) : 0);
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
      // (views on whole systems change slowly: each person rethinks them every six months, everyone when the system changes)
      if ((c.id + this.month) % 6 === 0 || this.month - this.regimeSince < 1 || this.month < 3) { this.judgeSystems(c, judge); c.judge.set(judge); this._identity(c); }
      else judge.set(c.judge);
      let fav = this.regime, best = judge[this.regime];
      for (let k = 0; k < NI; k++) if (judge[k] > best) { best = judge[k]; fav = k; }
      c.fav = fav; c.favScore = best - judge[this.regime];
      // ----- what to do this month: learn from what happened after last month's choice
      let local = regAct[c.region] / Math.max(1, regPop[c.region]);
      for (const id in c.comm) if (COMMUNITIES[CIDX[id]].kind === 'movement') local = Math.max(local, this.commActive[id] || 0);
      const f = this._features(c, local, rep, feat);
      if (c.jailed) { c.jailed--; c.action = 0; c.feat.set(f); continue; }
      const a = c.action;
      if (this.month > 0 && !c._arrested) {
        const same = a ? regSame[c.region][a] / Math.max(1, regPop[c.region]) : 0;
        // reward: did life get better? Acting also answers anger, solidarity and ideals (fighting for a system they believe in)
        // (taking up arms feels far less justified where people can speak freely and change things peacefully)
        let movement = false; for (const id in c.comm) if (COMMUNITIES[CIDX[id]].kind === 'movement') movement = true;
        const cause = Math.max(c.fav !== this.regime ? clamp(c.favScore, 0, 1) : 0, c.comm.separatists != null ? clamp(c.indep, 0, 1) : 0);
        const ideal = IDEALS[a] * cause * (a === 3 ? 1 - 0.75 * P[L.liberty] : 1) * (movement ? 1.3 : 1);
        let reward = 8 * (c.s - sPrev) + (a ? 0.6 * (0.45 - c.s) + 0.15 * same - ACTION_COST[a] + ideal : 0);
        this._learnAction(c, a, reward, f);
      }
      c._arrested = false;
      let choice = 0;
      if (r() < 0.03) choice = Math.floor(r() * NA);
      else { let mx = -Infinity; for (let b = 0; b < NA; b++) { const v = this._q(c, f, b); if (v > mx) { mx = v; choice = b; } } }
      if (choice === 2 && !((c.cls === 'worker' && c.employed) || c.cls === 'official')) choice = 1;   // only people with a job can strike
      c.action = choice; c.feat.set(f);
      // ----- talk with a neighbour, most often someone like themselves (or a fellow member of their community)
      if (r() < 0.15) {
        let o = cits[Math.floor(r() * cits.length)], k = 0;
        const mine = Object.keys(c.comm);
        if (mine.length && r() < 0.6) {
          const list = this.members[mine[Math.floor(r() * mine.length)]];
          if (list && list.length) { o = list[Math.floor(r() * list.length)]; k = 0.03; }
        }
        if (o !== c && (k || o.region === c.region)) {
          k = k || (o.cls === c.cls ? 0.02 : 0.005);
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
    const force = 3 * (0.4 + P[L.police]) * (this.succession > 0 ? (this.ideology.personal ? 0.5 : 0.7) : 1);   // what one armed official is worth (less while rulers fight over succession)
    const legit = 0.08 * (0.5 + P[L.liberty]);   // loyalty counts for more where people are free to speak and choose
    let offRebels = 0, offTotal = 0, civRebels = 0, antifa = 0;
    for (const c of cits) {
      if (c.cls === 'worker' && c.employed) workers++;
      if (c.cls === 'official') offTotal++;
      if (c.jailed) continue;
      const wantsChange = c.fav !== this.regime;
      if (c.action === 1) protest++; else if (c.action === 2) strike++; else if (c.action === 3) riot++;
      if (wantsChange && c.action) {
        // fighters count most; a general strike and a huge peaceful crowd count too
        let armed = false; for (const id in c.comm) if (ARMED.has(id)) armed = true;
        const wgt = c.action === 3 ? (c.cls === 'official' ? force : armed ? 2 : 1) : c.action === 2 ? 0.4 : 0.25;
        attack += wgt; want[c.fav] += wgt;
        if (c.action === 3) { if (c.cls === 'official') offRebels++; else civRebels++; }
      } else if (c.cls === 'official') defence += force * (0.3 + c.s);
      else if (!c.action && !wantsChange) {
        defence += legit * (c.s > 0.55 ? 2 : 1);   // people content with the system stand by it
        if (c.comm.antifa != null) antifa++;
        for (const id in c.comm) if (COMMUNITIES[CIDX[id]].kind === 'movement' && this._loyal(id)) { defence += 1; break; }   // loyal movements back a regime of their side
      }
    }
    // anti-fascists fight back against a far-right takeover
    let wantTot = 0, wantRight = 0; for (let k = 0; k < NI; k++) { wantTot += want[k]; if (FAR_RIGHT.has(k)) wantRight += want[k]; }
    if (wantTot > 0 && !FAR_RIGHT.has(this.regime)) defence += antifa * 0.6 * wantRight / wantTot;
    // a crown commands extra loyalty
    if (this.ideology.monarch || this.ideology.rule === 'crown') defence *= 1.15;
    // a personality cult: a feared or adored leader holds it together
    if (this.ideology.personal && this.faction && this.faction.leader) defence *= 1 + 0.15 * this.faction.leader.charisma;
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
    if (arrested >= 0.02 * cits.length && this.month - (this.news.arrests ?? -99) >= 24) { this.news.arrests = this.month; this.log(`Police arrest ${arrested} people at protests and strikes.`, 'repress'); }

    this._rebellions(force);
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

  /** Separatist uprisings: rebels of a province against the police stationed there (plus some sent from elsewhere). */
  _rebellions(force) {
    const A = new Float32Array(NR), D = new Float32Array(NR), R = new Float32Array(NR), POP = new Float32Array(NR), OFF = new Float32Array(NR);
    let offAll = 0;
    for (const c of this.citizens) {
      const k = c.region; POP[k]++;
      if (c.jailed) continue;
      if (c.cls === 'official') { OFF[k]++; offAll++; }
      if (c.action === 3 && c.indep > 0.2 && c.comm.separatists != null) { A[k] += c.cls === 'official' ? force : 1.5; R[k]++; }
      else if (c.cls === 'official') D[k] += force * (0.3 + c.s) * (c.indep > 0.2 ? 0.3 : 1);
      else if (c.indep < 0 && !c.action) D[k] += 0.1;
    }
    for (let k = 0; k < NR; k++) {
      if (!this.inVeyland(k) || !R[k]) { this.secessionRun[k] = 0; continue; }
      const attack = A[k], rebels = R[k], pop = POP[k];
      const defence = D[k] + (offAll - OFF[k]) * force * 0.08;   // reinforcements from the rest of the country
      this.secessionRun[k] = rebels >= 0.04 * pop && attack > defence ? this.secessionRun[k] + 1 : 0;
      if (rebels >= 0.05 * pop && attack < defence && this.month - (this.news['rebel' + k] ?? -99) >= 24) {
        this.news['rebel' + k] = this.month;
        this.log(`Separatist rebels in ${REGIONS[k].name} clash with police (${rebels} fighters, ${Math.round(attack)} strength against ${Math.round(defence)}).`, 'unrest');
      }
      if (this.secessionRun[k] >= 3) { this.secessionRun[k] = 0; this._secede(k, `won a war of independence`); this.hurt[k] = 1; return; }
    }
  }
  _changeRegime(to, how) {
    const from = this.regime, d = IDEOLOGIES[to], oldFaction = this.faction;
    this.regime = to; this.regimeSince = this.month;
    // a free democracy that falls (even halfway, into a guided one) is remembered, so that it can come back
    if (isFree(from) && !isFree(to) && how !== 'vote') this.fallen = { from, month: this.month, how };
    if (!isFree(from) && isFree(to)) { if (this.army) this.army.purged = this.month; this.fallen = null; }   // the new democrats retire the old regime's generals
    this.emergency = null; if (this.army) { this.army.plot = 0; if (how !== 'vote') this.army.purged = this.month; }
    this.regimeLog.push({ month: this.month, regime: to, how });
    // the new order forces its core laws at once
    for (let p = 0; p < NP; p++) {
      const v = clamp(this.P[p], d.lo[p], d.hi[p]);
      this.P[p] = v === this.P[p] ? v : (v + d.typical[p]) / 2;
      this.P[p] = clamp(this.P[p], d.lo[p], d.hi[p]);
    }
    this.target.set(this.P);
    if (how === 'revolution' || how === 'coup') {
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
    } else if (how !== 'vote') {
      // a peaceful change: property is reformed gradually, prisoners are freed (not after a self-coup), little is destroyed
      const st = this._shareTargets(this.P);
      for (const k in st) this.shares[k] += (st[k] - this.shares[k]) * 0.2;
      this.A *= 0.98;
      if (how === 'reform' || how === 'restored') for (const c of this.citizens) c.jailed = 0;
      if (how === 'putsch' || how === 'royalcoup') { this.A *= 0.97; this.u = Math.min(0.4, this.u + 0.02); }
    }
    this.amendment = null; this.directRun = null; this.pactRun = null; this.erosion = 0; this.erosionBy = null;
    // the crown: a figurehead monarch reigns in a constitutional monarchy; a ruling one leads the court
    const wasCrown = IDEOLOGIES[from].monarch || IDEOLOGIES[from].rule === 'crown';
    const prevKing = this.monarch || (this.faction && IDEOLOGIES[from].rule === 'crown' ? this.faction.leader : null);
    this.monarch = d.monarch ? (prevKing || this._newMonarch()) : null;
    if (wasCrown && !d.monarch && d.rule !== 'crown' && this.regimeLog.length > 1) this.log('The monarchy is abolished.', 'politics');
    this._reconcileClasses(false);
    for (const party of this.parties) party.govShare = 0;
    if (d.electoral) {
      if (!IDEOLOGIES[from].electoral || !this.parties.length) {
        this.deadParties.push(...this.parties); this.parties = [];
        this._foundPartySystem(4);
        this.log(`Parties are allowed again. New ones form: ${this.parties.map(p => p.name).join(', ')}.`, 'party');
      }
      this.faction = null;
      this.nextElection = this.month + 6;
      this._formCaretaker();
      this.dominant = null;
      if (d.guided && this.parties.length) {   // the strongest party (or the old rulers, turned into a party) becomes the ruling party
        const lead = this.parties.slice().sort((a, b) => (b.seats || 0) - (a.seats || 0))[0];
        this.dominant = lead.id;
        if (!IDEOLOGIES[from].electoral) { lead.name = oldFaction ? oldFaction.name : d.faction; if (oldFaction && oldFaction.leader && !oldFaction.leader.royal) lead.leader = oldFaction.leader; }
        this.log(`${lead.name} will run the country. Other parties may stand, but the state is on its side.`, 'politics');
      }
    } else {
      if (this.parties.length) { this.deadParties.push(...this.parties); this.parties = []; this.log('All parties are banned.', 'repress'); }
      this.faction = d.faction ? this._newFaction(d) : null;
      if (this.faction && d.rule === 'crown') this.faction.leader = prevKing || this._newMonarch();
      this.nextElection = Infinity;
      this.dominant = null;
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
  /** A system's floor for a law; an eroding democracy lets free speech sink below its usual floor. */
  _lo(p) { return this.ideology.lo[p] - (p === L.liberty ? 0.5 * this.erosion + (this.emergency ? 0.15 : 0) : 0); }
  _platform(params, inputs, party) {
    const net = this._net || (this._net = new Network(BRAIN_SIZES));
    net.params.set(params);
    const o = net.forward(inputs), d = this.ideology, out = new Float32Array(NP + 2);
    for (let p = 0; p < NP; p++) out[p] = (o[p] + 1) / 2;
    const A = party && party.arch ? ARCHETYPES[AIDX[party.arch]] : null;
    // a party never strays far from the laws it was founded for
    if (A) for (const p of A.lane) out[p] = clamp(out[p], party.core[p] - LANE, party.core[p] + LANE);
    for (let p = 0; p < NP; p++) out[p] = clamp(out[p], this._lo(p), d.hi[p]);
    out[OUT_CHANGE] = (o[OUT_CHANGE] + 1) / 2; out[OUT_WAR] = (o[OUT_WAR] + 1) / 2;
    if (A && A.aimIdx != null && A.aimIdx !== this.regime) out[OUT_CHANGE] = Math.max(out[OUT_CHANGE], 0.8);   // an anti-system party always campaigns for its system
    if (A && A.peace) out[OUT_WAR] = Math.min(out[OUT_WAR], 0.3);
    return out;
  }
  /** The system a set of promises comes closest to (other than the one in power); an anti-system party names its own. */
  aimOf(plat, party) {
    const A = party && party.arch ? ARCHETYPES[AIDX[party.arch]] : null;
    if (A && A.aimIdx != null && A.aimIdx !== this.regime) return A.aimIdx;
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

  /** How much a citizen feels a kind of party is "one of us" (0..1): class, communities, province, faith, age, hard times. */
  affinity(c, a) {
    const b = a.base; let x = a.bReg[c.region];
    if (b.cls) x += b.cls[c.cls] || 0;
    for (let i = 0; i < a.bComm.length; i++) if (c.comm[a.bComm[i]] !== undefined) x += a.bCommW[i];
    if (b.firm && c.cls === 'worker') x += b.firm[c.firm] || 0;
    if (b.rel) x += b.rel > 0 ? b.rel * Math.max(0, c.religious - 0.3) * 2 : -b.rel * Math.max(0, 0.3 - c.religious) * 3;
    if (b.young && c.age < 35) x += b.young;
    if (b.old && c.age > 60) x += b.old;
    if (b.immigrant && c.immigrant) x += b.immigrant;
    if (b.jobless && c.cls === 'worker' && !c.employed) x += b.jobless;
    if (b.unhappy) x += b.unhappy * clamp((0.5 - c.s) * 4, 0, 1);   // hard times: people who feel life is going badly
    return x >= 2 ? 1 : x / 2;
  }
  /** Refresh how "one of us" each kind of party standing now feels (all kinds: only when parties first form). */
  _refreshAff(c, all = false) {
    if (!c.aff) c.aff = new Float32Array(NAR);
    if (all) { for (let a = 0; a < NAR; a++) c.aff[a] = this.affinity(c, ARCHETYPES[a]); return; }
    for (const p of this.parties) if (p.arch) c.aff[AIDX[p.arch]] = this.affinity(c, ARCHETYPES[AIDX[p.arch]]);
  }
  /** How well the best-fitting national party standing now fits someone. */
  _servedAff(c) { let m = 0; for (const p of this.parties) if (p.arch && p.region == null) m = Math.max(m, c.aff[AIDX[p.arch]]); return m; }
  /** How many people feel a kind of party is "one of us" while no party standing now is (weighted by how strongly). */
  _unserved(a) {
    let n = 0;
    for (const c of this.citizens) { const f = this.affinity(c, a); if (f >= 0.5 && f > this._servedAff(c) + 0.25) n += f; }
    return n;
  }
  /** The kind of party most missing: a big group who would feel "one of us" about it, and promises far from every party standing. */
  _pickArch(exclude = []) {
    const have = new Set(this.parties.map(p => p.arch).concat(exclude));
    let best = null, bs = -Infinity;
    for (const a of ARCHETYPES) {
      if (a.regional || have.has(a.id) || a.aimIdx === this.regime) continue;
      const n = this._unserved(a);
      let gap = 1; for (const p of this.parties) { let d = 0; for (let j = 0; j < a.lane.length; j++) d += (p.platform[a.lane[j]] - a.laneVal[j]) ** 2; gap = Math.min(gap, Math.sqrt(d / a.lane.length) / 0.3); }
      const sc = n / this.citizens.length * (0.3 + gap) * (0.6 + 0.8 * this.rng()) * (a.aim ? 0.6 : 1);
      if (sc > bs) { bs = sc; best = a; }
    }
    return best;
  }
  /** The kind of party closest to the direction a group wants laws to move in (for lonely founders). */
  _archToward(dir) {
    const have = new Set(this.parties.map(p => p.arch));
    let best = null, bs = -Infinity, nd = 0; for (let p = 0; p < NP; p++) nd += dir[p] * dir[p];
    for (const a of ARCHETYPES) {
      if (a.regional || have.has(a.id) || a.aimIdx === this.regime) continue;
      let dot = 0, nv = 0; for (let p = 0; p < NP; p++) { const x = a.ideal[p] - this.P[p]; dot += x * dir[p]; nv += x * x; }
      const sc = dot / (Math.sqrt(nv * nd) || 1) + 0.1 * this.rng();
      if (sc > bs) { bs = sc; best = a; }
    }
    return best;
  }
  /** What a new party of a kind stands for: its core laws as founded, the rest half-way between its sect and today's laws. */
  _coreFor(a) {
    const d = this.ideology, core = new Float32Array(NP);
    for (let p = 0; p < NP; p++) core[p] = clamp(0.5 * a.ideal[p] + 0.5 * this.P[p], d.lo[p], d.hi[p]);
    for (let j = 0; j < a.lane.length; j++) core[a.lane[j]] = clamp(a.laneVal[j], 0.02, 0.98);
    return core;
  }
  _foundParty(ideal, region = null, archId = null, core = null) {
    if (this.parties.length >= 8) return null;
    const r = this.rng;
    const a = archId ? ARCHETYPES[AIDX[archId]] : region != null ? ARCHETYPES[AIDX.regionalist] : (this._pickArch() || ARCHETYPES[AIDX.labour]);
    const given = !!core;
    core = core || this._coreFor(a);
    if (ideal && !given) for (let p = 0; p < NP; p++) if (!a.lane.includes(p)) core[p] = clamp(0.5 * core[p] + 0.5 * ideal[p], 0.02, 0.98);
    const used = new Set(this.parties.map(p => p.color));
    let color = PARTY_COLORS.find(c => !used.has(c)) || PARTY_COLORS[this.partyCount % 8];
    let name;
    for (let tries = 0; tries < 20; tries++) {
      name = region != null ? `${REGIONS[region].name} ${['League', 'First', 'Movement', 'Union', 'Alliance', 'Party'][Math.floor(r() * 6)]}`
        : a.names.length && tries < 12 ? a.names[Math.floor(r() * a.names.length)]
        : (r() < 0.25 ? 'The ' : '') + PARTY_A[Math.floor(r() * PARTY_A.length)] + ' ' + PARTY_B[Math.floor(r() * PARTY_B.length)];
      if (![...this.parties, ...this.deadParties].some(p => p.name === name)) break;
    }
    const brain = this._freshBrain(core);
    const party = {
      id: 'p' + (++this.partyCount), name, color, founded: this.month, brain, arch: a.id, core,
      pool: [brain, ...Array.from({ length: 5 }, () => this._mutate(brain, 0.15))], poolScores: [],
      platform: null, seats: 0, votes: 0, share: 0, govShare: 0, money: 0,
      generation: 0, history: [], weak: -1, conscience: new Float32Array(3 * 2), decisions: [], lastShare: 0, scandals: 0, bribes: 0,
      donors: {}, region,   // region: a regional party only stands in its home region
      leader: this._newLeader(),
    };
    party.platform = this._platform(brain, this._inputs(0.2, false), party);
    party.family = familyOf(party.platform);
    const ai = AIDX[a.id];
    for (const c of this.citizens) { c.trust[party.id] = r.gauss() * 0.1; c.aff[ai] = this.affinity(c, a); }
    this.parties.push(party);
    return party;
  }
  /** The party system that forms when parties are first allowed: one big party of labour, one of property, then whatever groups feel left out. */
  _foundPartySystem(n) {
    for (const c of this.citizens) this._refreshAff(c, true);
    this._foundParty(null, null, this.rng() < 0.7 ? 'labour' : 'socialist');
    this._foundParty(null, null, this.rng() < 0.6 ? 'conservative' : 'business');
    for (let k = 2; k < n; k++) this._foundParty(null);
  }

  /** A named leader: charisma helps win votes; leaders age, resign, have scandals, and die. */
  _newLeader(minAge = 38) {
    const r = this.rng;
    return {
      name: SYL1[Math.floor(r() * SYL1.length)] + SYL2[Math.floor(r() * SYL2.length)] + ' ' + SUR1[Math.floor(r() * SUR1.length)] + SUR2[Math.floor(r() * SUR2.length)],
      age: minAge + r() * 22, charisma: clamp(r.gauss() * 0.5, -1, 1), ambition: clamp(r.gauss() * 0.45, -1, 1), since: this.month,
    };
  }
  _newMonarch(house) {
    const r = this.rng;
    house = house || SUR1[Math.floor(r() * SUR1.length)] + SUR2[Math.floor(r() * SUR2.length)];
    this.royalNumbers = this.royalNumbers || {};
    const n = this.royalNumbers[house] = (this.royalNumbers[house] || 0) + 1;
    const title = r() < 0.5 ? 'King' : 'Queen';
    const first = SYL1[Math.floor(r() * SYL1.length)] + SYL2[Math.floor(r() * SYL2.length)];
    const roman = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(10, n)] || String(n);
    return { name: `${title} ${first} ${roman} of House ${house}`, house, age: 20 + r() * 30, charisma: clamp(r.gauss() * 0.5, -1, 1), ambition: clamp(r.gauss() * 0.5, -1, 1), since: this.month, royal: true };
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
  _formCaretaker() { this.government = { parties: [], caretaker: true }; for (const p of this.parties) p.govSince = null; }

  /* ---------------- polls and elections ---------------- */
  _utility(c, party, platform) {
    if (party.region != null && party.region !== c.region) return -Infinity;   // not on the ballot here
    const P = this.P, w = c.w, core = party.core;
    let e = 0, sym = 0;
    for (let p = 0; p < NP; p++) {
      const d = platform[p] - P[p]; e += w[p] * d - VOTE_CAUTION * d * d;
      if (core) { const dc = core[p] - P[p]; sym += w[p] * dc - 0.01 * dc * dc; }
    }
    let u = HOPE * e + 0.6 * (c.trust[party.id] || 0) + (c.lastVote === party.id ? 0.15 : 0);
    if (core) u += SYM_W * clamp(HOPE * sym, -1, 1);   // sympathy with what the party stands for
    if (party.arch && party.region == null) u += AFF_W * c.aff[AIDX[party.arch]];         // "people like me vote for them"
    if (c.pid === party.id) u += PID_W * c.pidS;                                           // "we have always voted for them"
    if (party.govSince != null) u -= Math.min(FATIGUE_MAX, FATIGUE * Math.max(0, (this.month - party.govSince) / 12 - 4));   // "time for a change"
    else if (c.pidArch && c.pidArch === party.arch) u += 0.5 * PID_W * c.pidS;              // a new party of the family's kind
    if (party.leader) u += 0.25 * party.leader.charisma;                      // a likeable (or awful) leader
    const age = (this.month - (party.relaunched ?? party.founded)) / 12;
    if (c.age < 35 && age > 30) u -= 0.2 * Math.min(1, (age - 30) / 40);       // the young drift away from their grandparents' parties
    if (this.erosion > 0.2 && party.id === this.erosionBy) u += 0.4 * this.erosion;   // friendly media, harassed opponents, rigged rules
    if (party.id === this.dominant) u += 0.5;                                  // guided system: state TV, patronage jobs, harassed rivals
    const grudge = this.crisis + 0.1 * Math.min(3, this.gridlock);
    if (grudge > 0.1) {   // hard times: "the old parties have failed us"
      const mine = clamp(6 * (c.sRef - c.s) + (c.cls === 'worker' && !c.employed ? 0.4 : 0) + 0.3, 0, 1) * grudge;
      if (party.govShare > 0) u -= 0.5 * mine;
      if (party.outsider) u += 0.8 * mine;
      else if (party.arch && ARCHETYPES[AIDX[party.arch]].aim) u += 0.4 * mine;   // "only a new system can fix this"
    }
    u += 0.3 * taste(c.id, party.id);                                          // personal taste: a candidate they like, a family habit
    if (party.region != null) u += 0.15 + 0.6 * (c.identity || 0) * (c.culture === party.region ? 1 : 0.2);   // "one of us"
    // campaigning to change the whole system: welcome to those who want that system, alarming to the rest
    if (this.pushesChange(platform)) u += party.region != null ? 0.6 * clamp(c.indep, -1, 1)    // a regional party campaigning for independence
      : 0.5 * clamp(c.judge[this.aimOf(platform, party)] - c.judge[this.regime], -1, 1);
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
      if (best >= 0) counts[best] += this.voteWeight(c);
    }
    for (let k = 0; k < counts.length; k++) counts[k] /= Math.max(1, sample.length);
    return counts;
  }
  /** Utilities of every sampled voter for every party's promises (one row per voter). */
  _utilMatrix(sample, plats) {
    const K = plats.length, U = new Float64Array(sample.length * K);
    for (let i = 0; i < sample.length; i++) for (let k = 0; k < K; k++) U[i * K + k] = this._utility(sample[i], this.parties[k], plats[k]);
    return U;
  }
  /** The share party k would win promising plat, everyone else's promises as in U (same result as _poll, much cheaper). */
  _pollOne(sample, U, k, plat) {
    const K = this.parties.length, party = this.parties[k]; let n = 0;
    for (let i = 0; i < sample.length; i++) {
      const c = sample[i], uk = this._utility(c, party, plat); if (uk === -Infinity) continue;
      let win = true;
      for (let j = 0; j < k; j++) if (U[i * K + j] >= uk) { win = false; break; }
      if (win) for (let j = k + 1; j < K; j++) if (U[i * K + j] > uk) { win = false; break; }
      if (win) n += this.voteWeight(c);
    }
    return n / Math.max(1, sample.length);
  }
  /** One person, one vote; in a plutocracy a vote counts by how much the voter earns. */
  voteWeight(c) { return this.ideology.rule === 'wealth' ? clamp(c.net / Math.max(1, this.meanIncome), 0.05, 30) : 1; }
  _sample(n, region = null) {
    const cits = region == null ? this.citizens : this.citizens.filter(c => c.region === region), out = [];
    for (let i = 0; i < n && cits.length; i++) out.push(cits[Math.floor(this.rng() * cits.length)]);
    return out;
  }
  /** Monthly opinion poll (what people would vote for today), for the page. */
  _voteIntents() {
    if (!this.parties.length) { for (const c of this.citizens) c.voteIntent = null; return; }
    const shares = new Float32Array(this.parties.length), idx = {};
    this.parties.forEach((p, k) => { idx[p.id] = k; });
    const half = (this.month / 3) % 2;   // pollsters reach half the country each time
    for (const c of this.citizens) {
      if (c.id % 2 === half || !(c.voteIntent in idx)) {
        let best = -1, bu = -Infinity;
        for (let k = 0; k < this.parties.length; k++) {
          const u = this._utility(c, this.parties[k], this.parties[k].platform);
          if (u > bu) { bu = u; best = k; }
        }
        c.voteIntent = best >= 0 ? this.parties[best].id : null;
      }
      if (c.voteIntent in idx) shares[idx[c.voteIntent]] += this.voteWeight(c);
    }
    const tot = shares.reduce((a, b) => a + b, 0) || 1;
    this.parties.forEach((p, k) => { p.poll = shares[k] / tot; });
  }

  _election(snap) {
    const r = this.rng;
    // 1. citizens nobody speaks for may found a party (and a democracy never stays without an opposition for long)
    this._maybeFoundParty();
    while (this.parties.length < 4) {
      const p = this._foundParty(null);
      if (!p) break;
      this.log(`A new party, ${p.name} (${ARCHETYPES[AIDX[p.arch]].label.toLowerCase()}), is founded to take on the big parties.`, 'party');
    }
    const national = this._sample(160);
    const platformsNow = this.parties.map(p => p.platform);
    const K = this.parties.length, natU = this._utilMatrix(national, platformsNow);
    // 2. primaries: each party's candidates are tested in a poll; the best one leads
    for (let k = 0; k < this.parties.length; k++) {
      const party = this.parties[k];
      const inputs = this._inputs(party.share, party.govShare > 0);
      // the selectorate: party members who voted for it, and its home base (people who feel it is "one of us")
      const members = this.citizens.filter(c => c.lastVote === party.id), msample = [];
      for (let i = 0; i < Math.min(60, members.length); i++) msample.push(members[Math.floor(r() * members.length)]);
      const ai = party.arch ? AIDX[party.arch] : -1, bsample = [];
      if (ai >= 0) for (let i = 0; i < 400 && bsample.length < 60; i++) { const c = this.citizens[Math.floor(r() * this.citizens.length)]; if (c.aff[ai] >= 0.5 && (party.region == null || c.region === party.region)) bsample.push(c); }
      const sample = party.region != null ? this._sample(160, party.region) : national;   // regional parties poll at home
      const U = party.region != null ? this._utilMatrix(sample, platformsNow) : natU;
      party.poolScores = party.pool.map(params => {
        const plat = this._platform(params, inputs, party);
        const share = this._pollOne(sample, U, k, plat);
        let approve = 0; for (const c of msample) approve += sig(6 * this.expect(c, plat));
        approve = msample.length ? approve / msample.length : 0.5;
        if (bsample.length) { let b = 0, bw = 0; for (const c of bsample) { b += c.aff[ai] * sig(6 * this.expect(c, plat)); bw += c.aff[ai]; } approve = (1 - BASE_W) * approve + BASE_W * b / bw; }
        let donor = 0;
        for (const id in party.donors) { const l = this.lobbies.find(x => x.id === id); if (l) donor += party.donors[id] * l.dir * (plat[l.top] - this.P[l.top]); }
        let drift = 0; if (party.core) { for (let p = 0; p < NP; p++) drift += Math.abs(plat[p] - party.core[p]); drift /= NP; }   // activists punish a sell-out
        return share + 0.3 * approve + 0.2 * clamp(donor, -1, 1) - PURITY * drift;
      });
      let bi = 0; party.poolScores.forEach((s, i) => { if (s > party.poolScores[bi]) bi = i; });
      party.brain = party.pool[bi];
      party.platform = this._platform(party.brain, inputs, party);
      party.family = familyOf(party.platform);
      platformsNow[k] = party.platform;
      for (let i = 0; i < national.length; i++) natU[i * K + k] = this._utility(national[i], party, party.platform);
      party.bestCandidate = bi;
      // what the party stands for drifts slowly toward what it actually promises (its core laws only a little way from its roots)
      if (party.core) {
        const A = ARCHETYPES[AIDX[party.arch]], nc = Float32Array.from(party.core);
        for (let p = 0; p < NP; p++) nc[p] += 0.05 * (party.platform[p] - nc[p]);
        for (let j = 0; j < A.lane.length; j++) { const p = A.lane[j]; nc[p] = clamp(party.core[p] + 0.08 * (party.platform[p] - party.core[p]), A.laneVal[j] - 0.25, A.laneVal[j] + 0.25); }
        party.core = nc;
      }
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
    let turnout = 0, turnN = 0;
    for (const c of this.citizens) {
      if (c.jailed) continue;
      let best = -1, bu = -Infinity, second = -Infinity;
      for (let k = 0; k < this.parties.length; k++) {
        const u = this._utility(c, this.parties[k], this.parties[k].platform) + r.gauss() * 0.1;
        if (u > bu) { second = bu; bu = u; best = k; } else if (u > second) second = u;
      }
      const care = 0.45 + clamp(bu - second, 0, 0.4) + 0.15 * c.age / 90;
      if (best < 0 || r() > care) continue;
      const vw = this.voteWeight(c);
      votes[best] += vw; turnout += vw; turnN++; regTurnout[c.region] += vw; c.lastVote = this.parties[best].id;
      // party loyalty: each vote for the same party deepens the habit; voting elsewhere wears it down
      if (c.pid === c.lastVote) c.pidS = Math.min(0.8, c.pidS + 0.1);
      else if ((c.pidS -= 0.3) <= 0) { c.pid = c.lastVote; c.pidArch = this.parties[best].arch || null; c.pidS = 0.15; }
    }
    // (an eroding government cheats)
    if (this.erosion > 0.4 && this.erosionBy && r() < 0.5) {
      const cheat = this.parties.findIndex(p => p.id === this.erosionBy);
      if (cheat >= 0) {
        votes[cheat] += 0.08 * turnout; turnout *= 1.08;
        for (const c of this.citizens) if (c.lastVote !== this.erosionBy) c.trust[this.erosionBy] = clamp((c.trust[this.erosionBy] || 0) - 0.15, -1, 1);
        this.log(`Election fraud! Observers report stuffed ballot boxes for ${this.parties[cheat].name}.`, 'politics');
      }
    }
    // (a guided system manages the count: the ruling party always gets a cushion, rivals face a higher threshold)
    const domK = this.ideology.guided ? this.parties.findIndex(p => p.id === this.dominant) : -1;
    if (domK >= 0) { votes[domK] += 0.1 * turnout; turnout *= 1.1; }
    // 5. seats (largest averages, 101 seats, 4% threshold; a regional party with 20% at home gets in anyway)
    const shares = Array.from(votes, v => v / Math.max(1, turnout));
    const seats = new Int32Array(this.parties.length);
    const inParl = this.parties.map((p, k) => shares[k] >= (domK >= 0 && k !== domK ? 0.07 : 0.04) || (p.region != null && votes[k] / Math.max(1, regTurnout[p.region]) >= 0.2));
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
    // (a democratic breakthrough: the ruling party of a guided system loses so badly that even the rigged count cannot save it)
    // (or loses its majority, and the opposition unites against it)
    const crushed = domK >= 0 && seats[domK] < 40 && Math.max(...seats.filter((_, k) => k !== domK)) > seats[domK];
    if (domK >= 0 && (crushed || (seats[domK] < 51 && r() < 0.5))) {
      const dom = this.parties[domK], to = this._freeAgain();
      this.log(`Democratic breakthrough! Despite the managed count, ${dom.name} wins only ${seats[domK]} of 101 seats${crushed ? '' : ' and the opposition unites against it'}. It concedes, and Veyland becomes a ${IDEOLOGIES[to].name.toLowerCase()} again.`, 'reform');
      this._changeRegime(to, 'reform');
    }
    // 6. coalition: biggest party gathers the closest partners until it has a majority
    const wasGov = new Set(this.government ? this.government.parties : []);
    const gov = this._formGovernment([]);
    const names = gov.map(p => `${p.name} (${p.seats})`).join(' + ');
    this.elections.push({ month: this.month, turnout: turnN / this.citizens.length, results: this.parties.map((p, k) => ({ id: p.id, name: p.name, color: p.color, share: shares[k], seats: seats[k] })), gov: this.government.parties.slice() });
    this.log(`Election${this.ideology.rule === 'wealth' ? ' (votes counted by wealth)' : ''}: ${Math.round(100 * turnN / this.citizens.length)}% turnout. ${gov.length > 1 ? 'Coalition' : 'Government'}: ${names}.`, 'election');
    // 7. evolution: keep the winning candidate, try variations, borrow from rivals
    for (const party of this.parties) {
      // a bad result, or losing power, often costs the leader their job
      const lost = wasGov.has(party.id) && party.govShare === 0;
      if (party.lastShare > 0.05 && (party.share < 0.7 * party.lastShare || lost) && r() < 0.45) this._replaceLeader(party, `resigns as leader of ${party.name} after ${lost ? 'losing power' : 'a bad result'}`);
      const kids = [party.brain];
      for (let i = 0; i < 4; i++) kids.push(this._mutate(party.brain, 0.12 + 0.1 * r()));
      // one candidate goes back to the party's roots: the same brain, its resting promises reset to what the party stands for
      const roots = Float32Array.from(party.brain);
      if (party.core) { const n1 = BRAIN_SIZES[1], b0 = n1 * (BRAIN_SIZES[0] + 1); for (let j = 0; j < NP; j++) roots[b0 + j * (n1 + 1) + n1] = Math.atanh(clamp(2 * party.core[j] - 1, -0.95, 0.95)); }
      kids.push(this._mutate(roots, 0.05));
      party.pool = kids; party.generation++;
      // learning about bribes: did taking (or refusing) them pay off in votes?
      const delta = (party.share - party.lastShare) * 10;
      for (const d of party.decisions) party.conscience[d.s * 2 + d.a] += 0.25 * (delta - party.conscience[d.s * 2 + d.a]);
      party.decisions = [];
      party.money = 0; party.donors = {}; party.bribesAtElection = party.bribes;
      party.weak = party.share < 0.03 ? party.weak + 1 : 0;
    }
    // 8. parties nobody votes for twice in a row fold
    for (const party of this.parties.filter(p => p.weak >= 2 && this.parties.length > 2 && p.id !== this.dominant)) {
      this.parties.splice(this.parties.indexOf(party), 1); this.deadParties.push(party);
      this.log(`${party.name} folds after two elections below 3%.`, 'party');
    }
    // 8b. big parties whose own voters feel abandoned may split; small, similar ones may merge
    this._maybeRebrand();
    this._maybeSplit();
    this._maybeMerge();
    if (this.ideology.guided && !this.parties.some(p => p.id === this.dominant)) this.dominant = this.parties.slice().sort((a, b) => b.seats - a.seats)[0].id;
    this.nextElection = this.month + 48;
    // 9. war or peace, if the new government wants it
    this._warPolicy();
    // 10. changing the system itself, and provinces voting on independence
    this._constitution();
    if (this.ideology.electoral) this._independenceVotes();
  }

  /** The biggest party gathers the parties closest to it until it has a majority (or governs as a minority). */
  _formGovernment(exclude) {
    const cands = this.parties.filter(p => p.seats > 0 && !exclude.includes(p.id)).sort((a, b) => b.seats - a.seats);
    for (const p of this.parties) p.govShare = 0;
    if (!cands.length) { this._formCaretaker(); return []; }
    const lead = (this.ideology.guided && cands.find(p => p.id === this.dominant)) || cands[0];   // a guided system: the ruling party governs
    const dist = q => { let d = 0; for (let k = 0; k < NP; k++) d += (q.platform[k] - lead.platform[k]) ** 2; return d + (enemies(q.arch, lead.arch) ? 0.6 : 0); };   // never with them
    const rest = cands.filter(p => p !== lead).sort((a, b) => dist(a) - dist(b));
    const gov = [lead]; let have = lead.seats;
    while (have < 51 && rest.length) {
      const q = rest.shift();
      if (dist(q) > 0.8) continue;                                                     // too far apart to agree
      if ((q.outsider || lead.outsider) && this.rng() > 0.25 + this.crisis) continue;   // a cordon around the outsider
      gov.push(q); have += q.seats;
    }
    if (have < 51) { this.gridlock += 0.5; this.log(`Hung parliament: no group of parties can agree on a majority. ${lead.name} governs alone with ${have} of 101 seats.`, 'politics'); }
    for (const p of this.parties) if (!gov.includes(p)) p.govSince = null; else if (p.govSince == null) p.govSince = this.month;
    const target = new Float32Array(NP);
    for (const q of gov) { q.govShare = q.seats / Math.max(1, have); for (let k = 0; k < NP; k++) target[k] += q.platform[k] * q.govShare; }
    this.target = target;
    this.government = { parties: gov.map(q => q.id), caretaker: false, since: this.month, seats: have, minority: have < 51 };
    return gov;
  }

  /** Coalitions can fall apart between elections: after a scandal, or when a partner's support is collapsing. */
  _coalitionCheck() {
    const g = this.government;
    if (!this.ideology.electoral || !g || g.caretaker || this.month - g.since < 6) return;
    if (g.minority && this.nextElection - this.month > 6 && this.rng() < 0.025) {
      this.gridlock += 1;
      this.log('The minority government loses a vote of confidence. A snap election is called.', 'politics');
      this.nextElection = this.month + 2; return;
    }
    if (g.parties.length < 2) return;
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
        this.log(`${p.name} walks out of the government ${why}. It loses its majority and a snap election is called.`, 'politics'); this.gridlock += 1;
        this.nextElection = Math.min(this.nextElection, this.month + 2);
      }
      return;
    }
  }

  /* ---------------- communities ---------------- */
  /** How well a community fits someone (before the pull of friends already in it). */
  _fit(c, id, farRight) {
    const f = this._fitBase(c, id, farRight);
    // a movement draws its most committed people first; the bigger it already is, the less it pulls in the rest
    return f > -1 && COMMUNITIES[CIDX[id]].kind === 'movement' ? f - 2 * ((this.members[id] || []).length / this.citizens.length) : f;
  }
  _fitBase(c, id, farRight) {
    const P = this.P, w = c.w, favS = clamp(c.favScore, 0, 1);
    switch (id) {
      case 'church': return c.religious - 0.35;
      case 'unionclub': return c.cls === 'worker' && c.employed && P[L.unions] > 0.1 ? 0.1 + 2 * w[L.unions] + 0.2 * P[L.unions] : -1;
      case 'farmcoop': return c.cls === 'small' ? (['farmland', 'forest villages'].includes(REGIONS[c.region].kind) ? 0.3 : 0.05) + w[L.smallprop] : -1;
      case 'students': return c.age < 26 ? 0.15 : -1;
      case 'business': return c.cls === 'owner' ? 0.35 : -1;
      case 'veterans': return c.veteran || (c.cls === 'official' && c.age > 45) ? 0.25 : -1;
      case 'newcomers': return c.immigrant ? 0.35 : -1;
      case 'antifa': return FAR_RIGHT.has(c.fav) ? -1 : 1.5 * w[L.liberty] + Math.min(0.4, 1.2 * farRight) - 0.4 + (c.age < 35 ? 0.1 : 0);
      case 'patriots': return FAR_RIGHT.has(c.fav) ? (c.fav === this.regime ? -0.1 : -0.15 + 0.4 * favS) + 1.5 * w[L.police] : -1;
      case 'redguards': return FAR_LEFT.has(c.fav) ? (c.fav === this.regime ? -0.1 : -0.15 + 0.4 * favS) + 1.5 * w[L.unions] : -1;
      case 'greens': return 1.5 * w[L.regulation] - 0.3 + (c.age < 40 ? 0.1 : 0);
      case 'sports': return c.age < 60 ? 0.02 + (c.cls === 'worker' ? 0.08 : 0) : -1;
      case 'heritage': return c.culture >= 0 && c.culture === c.region ? c.identity - 0.5 : -1;
      case 'separatists': return c.culture === c.region && c.culture >= 0 && this.inVeyland(c.region) ? 1.2 * c.indep - 0.15 : -1;
      case 'peace': return -1.5 * w[W_WAR] - 0.35 + (this.war ? 0.3 : 0) + 0.2 * this.tension;
      case 'revivalists': return c.religious > 0.6 ? 1.5 * w[L.faith] + 0.4 * (c.religious - 0.6) - 0.3 + (P[L.faith] < 0.3 ? 0.15 : 0) : -1;
      case 'secularists': return c.religious < 0.25 ? -1.5 * w[L.faith] - 0.3 + (P[L.faith] > 0.5 ? 0.2 : 0) : -1;
      case 'monarchists': return MONARCHIES.has(c.fav) ? (c.fav === this.regime ? -0.15 : -0.15 + 0.4 * favS) : -1;
      case 'blackbloc': return ANARCHIST.has(c.fav) ? (c.fav === this.regime ? -0.15 : -0.12 + 0.4 * favS) + (c.age < 35 ? 0.1 : 0) : -1;
      case 'taxrevolt': return -1.5 * w[L.tax] + 0.6 * (P[L.tax] - 0.45) - 0.3 + (c.cls === 'small' || c.cls === 'owner' ? 0.1 : 0);
    }
    return -1;
  }
  /** A movement is loyal to the regime (rather than hunted by it) when it shares the regime's side. */
  _loyal(id) {
    const g = this.regime;
    return (id === 'patriots' && FAR_RIGHT.has(g)) || (id === 'redguards' && FAR_LEFT.has(g)) || (id === 'monarchists' && MONARCHIES.has(g))
      || (id === 'blackbloc' && ANARCHIST.has(g)) || (id === 'revivalists' && (IDEOLOGIES[g].id === 'theocracy' || IDEOLOGIES[g].id === 'lanternrep'));
  }
  /** Who belongs where, and how many of each movement were out on the street last month (changes nothing). */
  _indexCommunities() {
    const members = {}, active = {}, regCount = new Float32Array(NR * NCOM), regPop = new Float32Array(NR);
    for (const m of COMMUNITIES) { members[m.id] = []; active[m.id] = 0; }
    for (const c of this.citizens) {
      regPop[c.region]++;
      for (const id in c.comm) { members[id].push(c); regCount[c.region * NCOM + CIDX[id]]++; if (c.action) active[id]++; }
    }
    for (const id in members) active[id] = members[id].length ? active[id] / members[id].length : 0;
    this.members = members; this.commActive = active;
    return { members, regCount, regPop };
  }
  _communities(initial) {
    const r = this.rng, P = this.P, cits = this.citizens;
    const rep = P[L.police] * (1 - P[L.liberty]);
    const { members, regCount, regPop } = this._indexCommunities();
    let farRight = 0; for (const c of cits) if (FAR_RIGHT.has(c.fav) && c.fav !== this.regime) farRight++;
    farRight /= cits.length;
    // each month a sixth of people take stock of their communities
    for (const c of cits) {
      if (!initial && (c.id + this.month) % 6 !== 0) continue;
      if (c.jailed) continue;
      const mine = Object.keys(c.comm);
      if ((c.id + this.month) % 12 === 0 || initial) this._refreshAff(c);
      // the faithful grow more devout in church; elsewhere faith slowly fades, faster with schooling and free speech
      if (c.comm.church != null && c.religious > 0.3) c.religious = Math.min(1, c.religious + 0.005);
      else c.religious = Math.max(0, c.religious - 0.004 * (0.5 + P[L.services] + P[L.liberty]) / 2);
      // learn what each membership is worth: belonging and ideals, minus time, risk and (in some places) the police
      mine.forEach((id, rank) => {
        const m = COMMUNITIES[CIDX[id]];
        const fit = this._fit(c, id, farRight);
        let reward = [0.2, 0.15, 0.08][rank] + (m.kind === 'movement' ? 0.4 * fit : 0.3 * Math.max(0, fit)) - (m.kind === 'movement' ? 0.15 : 0.08);
        if (m.kind === 'movement' && rep > 0.2 && !this._loyal(id)) {
          reward -= 0.2 * rep;   // fear
          if (!initial && r() < 0.15 * rep) { c.jailed = 6 + Math.floor(r() * 13); c.arrests++; reward -= 0.8; }
        }
        if (this._fit(c, id, farRight) <= -1) reward = -1;   // no longer fits (aged out, lost the job...)
        c.comm[id] += 0.3 * (reward - c.comm[id]);
        if (c.comm[id] < -0.05) delete c.comm[id];
      });
      // maybe join one more
      if (Object.keys(c.comm).length >= 3 || r() > 0.5) continue;
      let best = null, bs = 0.05;
      for (const m of COMMUNITIES) {
        if (c.comm[m.id] != null) continue;
        const f = this._fit(c, m.id, farRight);
        if (f <= -1) continue;
        if (f < (m.kind === 'movement' ? 0 : -0.25)) continue;   // friends can talk you into a community that nearly fits; a movement takes conviction
        const sc = f + (m.kind === 'movement' ? 0.15 : 0.3) * regCount[c.region * NCOM + CIDX[m.id]] / Math.max(1, regPop[c.region]) + 0.05 * r.gauss();
        if (sc > bs) { bs = sc; best = m.id; }
      }
      if (best) c.comm[best] = 0.1;
    }
    if (initial) return;
    // street clashes where rival movements are out at the same time
    for (let k = 0; k < NR; k++) {
      const out = id => members[id].filter(c => c.region === k && c.action).length;
      const pairs = [['antifa', 'patriots'], ['redguards', 'patriots'], ['blackbloc', 'patriots'], ['separatists', 'patriots'], ['revivalists', 'secularists'], ['blackbloc', 'monarchists']];
      const pair = pairs.find(([x, y]) => out(x) >= 5 && out(y) >= 5);
      const rival = pair ? pair.map(id => COMMUNITIES[CIDX[id]].name) : null;
      if (rival && this.month - this.lastClash[k] >= 36) {
        this.lastClash[k] = this.month;
        this.hurt[k] = clamp(this.hurt[k] + 0.05, 0, 1);
        const dead = r() < 0.3;
        if (dead) { const pool = [...members[pair[0]], ...members[pair[1]]].filter(c => c.region === k); if (pool.length) this._replace(cits.indexOf(pool[Math.floor(r() * pool.length)])); }
        this.log(`Street clashes in ${REGIONS[k].name} between ${rival[0]} and ${rival[1]}${dead ? '. One person is killed' : '. Many are hurt'}.`, 'unrest');
      }
    }
    // once a year each sizeable community backs the party its members like best
    if (this.month % 12 === 7 && this.parties.length) for (const m of COMMUNITIES) {
      const list = members[m.id];
      if (list.length < 10) { this.endorse[m.id] = null; continue; }
      const sample = list.length > 40 ? list.slice(0, 40) : list;
      let best = null, bu = -Infinity;
      for (const p of this.parties) {
        let u = 0; for (const c of sample) { const v = this._utility(c, p, p.platform); u += Number.isFinite(v) ? v : -2; }
        if (u > bu) { bu = u; best = p; }
      }
      this.endorse[m.id] = best ? best.id : null;
      if (best) for (const c of list) c.trust[best.id] = clamp((c.trust[best.id] || 0) + 0.03, -1, 1);
    }
  }

  /* ---------------- provinces: autonomy and independence ----------------
     Support for independence comes from what people feel (identity, grievance, autonomy, bans).
     Electoral systems may grant autonomy; regional parties may win a referendum; separatists may rebel. */
  _provinces() {
    const r = this.rng, P = this.P, d = this.ideology, cits = this.citizens;
    if (this.month % 3 !== 0) return;
    const yes = new Float32Array(NR), pop = new Float32Array(NR);
    for (const c of cits) { pop[c.region]++; if (c.indep > 0) yes[c.region]++; }
    for (let k = 0; k < NR; k++) {
      if (!this.inVeyland(k)) { this.indepSupport[k] = 0; continue; }
      const sup = this.indepSupport[k] = yes[k] / Math.max(1, pop[k]);
      const name = REGIONS[k].name;
      // a language ban fades when freedom returns
      if (this.langBan[k] > 0) { this.langBan[k] -= 3; if (P[L.liberty] >= 0.6) { this.langBan[k] = 0; this.log(`${REGIONS[k].culture.dialect.split(',')[0]} may be taught in ${name}'s schools again.`, 'culture'); } }
      if (this.regionStatus[k] === 'province' && sup > 0.3) {
        // an elected government grants autonomy if its parties' (learned) promises favour it, a regional party governs with it, or most there want out
        let govAuto = 0; for (const p of this.parties) if (p.govShare > 0) govAuto += p.govShare * p.platform[L.autonomy];
        if (d.electoral && (sup > 0.55 || this.parties.some(p => p.region === k && p.govShare > 0) || (govAuto > 0.5 && sup > 0.35)) && r() < 0.1) {
          this.regionStatus[k] = 'autonomous';
          this.log(`Autonomy deal: ${name} gets its own assembly and the right to use ${REGIONS[k].culture.dialect.split(',')[0]} in schools and courts. ${Math.round(sup * 100)}% there had wanted independence.`, 'politics');
        } else if (!d.electoral && P[L.autonomy] < 0.3 && this.langBan[k] <= 0 && r() < 0.02) {
          this.langBan[k] = 120;
          this.log(`The government bans ${REGIONS[k].culture.dialect.split(',')[0]} in ${name}'s schools and offices, hoping to stamp out separatism.`, 'culture');
        }
      } else if (this.regionStatus[k] === 'autonomous' && !d.electoral && P[L.autonomy] < 0.3 && r() < 0.02) {
        this.regionStatus[k] = 'province';
        this.log(`${this.faction ? 'The ' + this.faction.name.replace(/^The /, '') : 'The new government'} abolishes ${name}'s autonomy.`, 'politics');
      }
    }
  }
  /** After an election: a regional party campaigning for independence that wins half its region's vote gets a referendum. */
  _independenceVotes() {
    for (const p of this.parties) {
      const k = p.region;
      if (k == null || !this.inVeyland(k) || !this.pushesChange(p.platform) || (p.homeShare ?? 0) < 0.5) continue;
      let yes = 0, no = 0;
      for (const c of this.citizens) {
        if (c.region !== k || c.jailed) continue;
        if (this.rng() > 0.55 + clamp(Math.abs(c.indep), 0, 0.4)) continue;
        if (c.indep > 0) yes++; else no++;
      }
      const share = yes / Math.max(1, yes + no), turnout = (yes + no) / Math.max(1, this.citizens.filter(c => c.region === k).length);
      const res = `${Math.round(share * 100)}% yes, ${Math.round(turnout * 100)}% turnout`;
      this.independenceVotes = (this.independenceVotes || []).concat({ month: this.month, region: k, share, turnout });
      if (share < 0.55 || turnout < 0.5) { this.log(`${REGIONS[k].name} votes in an independence referendum called by ${p.name}: ${res}. It stays in Veyland.`, 'politics'); continue; }
      // a liberal democracy usually respects the result; other systems often refuse
      const respects = ['democracy', 'constmon', 'federal', 'socialrep'].includes(this.ideology.id) ? 0.6 : 0.15;
      if (this.rng() < respects) { this._secede(k, `voted to leave (${res})`); return; }
      this.log(`${REGIONS[k].name} votes to leave Veyland (${res}), but the government refuses to recognise the result. Anger grows.`, 'politics');
      for (const c of this.citizens) if (c.region === k && c.culture === k) c.identity = Math.min(1, c.identity + 0.08);
    }
  }
  _secede(k, how) {
    const name = REGIONS[k].name, r = this.rng;
    this.regionStatus[k] = 'independent';
    // people from elsewhere may move back into Veyland; everyone else leaves with their province
    const stay = [], gone = [];
    for (const c of this.citizens) {
      if (c.region !== k) { stay.push(c); continue; }
      if (c.culture !== k && c.indep < 0 && r() < 0.5) { c.region = this._moveTarget(c); stay.push(c); }
      else { gone.push(c); this.freeHomes.push(c.home); }
    }
    this.citizens = stay;
    this.N0 = Math.max(150, this.N0 - gone.length);
    this.A *= 0.97;
    for (const p of this.parties.filter(p => p.region === k)) { this.parties.splice(this.parties.indexOf(p), 1); this.deadParties.push(p); }
    this.independence.push({ month: this.month, region: k, how, people: gone.length });
    this.log(`${name} is independent! It has ${how}. ${gone.length} people leave Veyland with it; the new country calls itself Free ${name}.`, 'revolution');
  }
  /** Where someone would move to for a better life (or -1 to stay). */
  _moveTarget(c) {
    const st = this.regionStats; let best = -1, bv = -Infinity;
    for (let k = 0; k < NR; k++) {
      if (!this.inVeyland(k) || k === c.region) continue;
      const v = (st ? st.pay[k] / Math.max(1, st.natPay) - 2 * st.unemp[k] : 0) - this.hurt[k] + (k === c.culture ? 0.3 : 0) + 0.1 * this.rng.gauss();
      if (v > bv) { bv = v; best = k; }
    }
    return best < 0 ? c.region : best;
  }
  /** People move between provinces for work and safety, carrying their culture with them. */
  _internalMigration() {
    const r = this.rng, st = this.regionStats;
    if (!st) return;
    for (const c of this.citizens) {
      if (c.jailed || c.age > 55 || c.cls === 'owner' || c.cls === 'small' || c.cls === 'official') continue;
      const k = c.region;
      const push = 0.0008 + (c.cls === 'worker' && !c.employed ? 0.006 : 0) + 0.01 * this.hurt[k] + (st.pay[k] < 0.85 * st.natPay ? 0.001 : 0);
      if (r() > push) continue;
      const to = this._moveTarget(c);
      const gain = (st.pay[to] - st.pay[k]) / Math.max(1, st.natPay) - 2 * (st.unemp[to] - st.unemp[k]) + this.hurt[k] - this.hurt[to] + (to === c.culture ? 0.3 : 0) - (k === c.culture ? 0.3 * c.identity : 0);
      if (to !== k && gain > 0.1) { c.region = to; if (c.cls === 'worker') c.employed = false; }
    }
  }

  /* ---------------- democratic backsliding ----------------
     An elected strongman (or a party campaigning for an authoritarian system) with a majority
     slowly erodes the rules: courts, press, opposition. Protests slow it; losing power reverses it.
     If it goes all the way, elections are suspended. */
  /* ---------------- how democracies die, and come back ----------------
     Hard times and gridlock make people angry at the old parties and make the government look weak.
     Slow death: a government erodes the rules (a strongman, an outsider, emergency rule, a personality cult,
     a party too long in power, oligarchs). Sudden death: a coup (the army, the crown, foreign or oligarch money).
     Resistance: protests, courts, a free press, a loyal army, a monarch who refuses. Dictatorships born this way can end. */
  _lead() {
    const g = this.government; if (!g || g.caretaker) return null;
    let b = null; for (const p of this.parties) if (g.parties.includes(p.id) && (!b || p.seats > b.seats)) b = p;
    return b;
  }
  _fragility() {
    const d = this.ideology;
    let hurt = 0, crime = 0; for (let k = 0; k < NR; k++) { hurt += this.hurt[k] / NR; crime += this.crime[k] / NR; }
    // hard times: joblessness, a shrinking economy, cuts, disasters, a losing war (rises fast, fades slowly)
    const hard = clamp(3 * (this.u - 0.08) + Math.max(0, -5 * this.growth) + hurt + (this.austerity > 0 ? 0.25 : 0) + (1 - this.payFactor)
      + (this.war && this.war.score < -0.3 ? 0.3 : 0), 0, 1);
    this.crisis += (hard - this.crisis) * (hard > this.crisis ? 0.1 : 0.02);
    this.gridlock *= 0.985;
    this.fear = clamp(2 * crime + (this.war ? 0.4 : 0) + hurt + 0.5 * this.crisis + 3 * this.riotFrac, 0, 1);
    if (!d.electoral) { this.emergency = null; this.erosion = 0; this.erosionBy = null; this._restoration(); return; }
    this._emergencyStep();
    if (this.month % 12 === 6) this._maybeOutsider();
    this._erosionStep();
    if (this.regime === IDX[d.id] && this.month % 3 === 0) this._armyStep(crime);
  }

  _emergencyStep() {
    const r = this.rng, P = this.P, e = this.emergency, lead = this._lead();
    if (!e) {
      let why = null;
      if (this.war && this.war.by === 'them' && this.war.months === 1) why = `${NEIGHBOUR}'s invasion`;
      else if (this.month - this.terror <= 1) why = 'the terror attack';
      else if (Math.max(...this.hurt) > 0.6 && this.month - (this.news.emerg ?? -99) > 24) why = 'the disaster';
      else if (this.riotFrac > 0.03 && this.month - (this.news.emerg ?? -99) > 24) why = 'weeks of rioting';
      if (!why || !lead) return;
      this.news.emerg = this.month;
      const pl = lead.platform, amb = lead.leader.ambition || 0;
      if (r() > clamp(0.25 + 0.8 * (1 - pl[L.liberty]) + 0.3 * pl[L.police] + 0.3 * amb, 0.15, 0.95)) return;
      this.emergency = { since: this.month, why, by: lead.id, renewals: 0 };
      this.target[L.police] = Math.max(this.target[L.police], Math.min(1, P[L.police] + 0.15));
      this.log(`State of emergency! After ${why}, ${lead.name} gives itself emergency powers: curfews, searches without warrants, protests only with permission.`, 'politics');
      return;
    }
    if ((this.month - e.since) % 6 !== 5) return;
    // every six months parliament must renew it
    const amb = lead ? lead.leader.ambition || 0 : 0;
    const keep = lead && lead.id === e.by && r() < clamp(this.fear + 0.4 * amb + 0.5 * (0.8 - lead.platform[L.liberty]), 0, 0.95);
    const court = r() < 0.15 * this.press.independent * P[L.liberty];
    const street = this.protestFrac > 0.1;
    if (keep && !court && !street) {
      e.renewals++;
      if (e.renewals === 2 || e.renewals % 4 === 0) this.log(`Parliament renews the state of emergency ${e.renewals === 2 ? 'again' : `for the ${e.renewals}th time`}, though the danger ${this.fear < 0.2 ? 'has long passed' : 'lingers'}. ${lead.name} says the country is not safe yet.`, 'politics');
      return;
    }
    this.emergency = null;
    this.log(court ? `The constitutional court rules the state of emergency illegal. After ${Math.round(this.month - e.since)} months, normal rights return.`
      : street ? 'Crowds defy the curfew night after night. The government gives up its emergency powers.'
      : `The state of emergency ends after ${Math.round(this.month - e.since)} months.`, 'politics');
  }

  /** In hard times a fiery outsider may found a movement against "the old parties". */
  _maybeOutsider() {
    const grudge = this.crisis + 0.1 * Math.min(3, this.gridlock), r = this.rng, d = this.ideology;
    if (this.parties.some(p => p.outsider) || this.parties.length >= 8 || grudge < 0.3 || r() > grudge) return;
    const angry = this.citizens.filter(c => c.sRef - c.s > 0.01 || (c.cls === 'worker' && !c.employed));
    if (angry.length < 30) return;
    const ideal = new Float32Array(NP);
    for (let p = 0; p < NP; p++) { let s = 0; for (const c of angry) s += Math.tanh(c.w[p] * 5); ideal[p] = clamp(this.P[p] + 0.35 * s / angry.length, 0.02, 0.98); }
    // left or right: what the angry believe would help (state, unions, wages vs police, borders, faith), how many are in militias, and luck
    let lean = 0;
    for (const c of angry) lean += Math.tanh(5 * c.w[L.state]) + Math.tanh(5 * c.w[L.unions]) + Math.tanh(5 * c.w[L.wage]) - Math.tanh(5 * c.w[L.police]) + Math.tanh(5 * c.w[L.trade]) - Math.tanh(5 * c.w[L.faith])
      + (c.comm.redguards != null ? 1 : 0) - (c.comm.patriots != null ? 1 : 0);
    let crime = 0; for (let k = 0; k < NR; k++) crime += this.crime[k] / NR;
    const left = lean / angry.length - 0.15 + 3 * (this.gini - 0.35) - 2 * crime - 0.5 * this.tension + 0.6 * this.rng.gauss() > 0;   // inequality pulls left; crime and foreign threats pull right
    ideal[L.liberty] = d.lo[L.liberty]; ideal[L.police] = Math.max(ideal[L.police], 0.75);   // a firm hand
    if (left) { ideal[L.state] = Math.max(ideal[L.state], 0.45); ideal[L.tax] = Math.max(ideal[L.tax], 0.5); }
    else { ideal[L.trade] = Math.min(ideal[L.trade], 0.25); ideal[L.autonomy] = Math.min(ideal[L.autonomy], 0.15); ideal[L.faith] = Math.max(ideal[L.faith], 0.5); }
    const p = this._foundParty(null, null, left ? 'populist' : 'nationalist', Float32Array.from(ideal));
    if (!p) return;
    p.outsider = true;
    p.leader.charisma = 0.6 + 0.4 * r(); p.leader.ambition = 0.5 + 0.5 * r();
    const sur = p.leader.name.split(' ')[1];
    const name = r() < 0.4 ? `${sur}'s Movement` : `${left ? "The People's" : 'National'} ${['Renewal', 'Awakening', 'Revival', 'Resolve'][Math.floor(r() * 4)]}`;
    if (![...this.parties, ...this.deadParties].some(q => q.name === name)) p.name = name;
    for (const c of angry) c.trust[p.id] = 0.25;
    const jobless = Math.round(this.u * 100);
    this.log(`Hard times${jobless >= 10 ? ` (${jobless}% of workers jobless)` : ''}: ${p.leader.name}, a fiery outsider, founds ${p.name}. ${left ? 'Blaming the rich and the bankers' : 'Blaming foreigners, the provinces and the old parties'}, ${p.leader.name.split(' ')[0]} promises to "clean out" politics with a firm hand.`, 'party');
  }

  _erosionStep() {
    const d = this.ideology, g = this.government, lead = this._lead();
    let why = null, rate = 0, to = -1, capt = null;
    if (lead && (g.seats || 0) >= 51 && lead.seats >= 34) {
      const pl = lead.platform, amb = lead.leader.ambition || 0;
      const yrs = Math.min(this.month - lead.leader.since, this.month - (lead.govSince ?? this.month)) / 12;
      const auth = this.pushesChange(pl) && AUTHORITARIAN.has(this.aimOf(pl, lead));
      const strongman = pl[L.liberty] <= d.lo[L.liberty] + 0.05 && pl[L.police] >= 0.6;   // (the system's usual floor, not the eroded one)
      capt = this.lobbies.find(l => l.friend === lead.id && this.press[l.id] >= 0.1 && this.C > 0.12 && lead.bribes - (lead.bribesAtElection || 0) >= 2);
      if (auth) { why = 'auth'; rate = 0.11; to = this.aimOf(pl, lead); }
      else if (strongman && lead.seats >= 40) { why = 'strongman'; rate = 0.1; }
      else if (lead.outsider && amb > 0.3) { why = 'outsider'; rate = 0.12; }
      else if (lead.leader.charisma > 0.7 && amb > 0.35 && yrs >= 6) { why = 'cult'; rate = 0.08 + 0.04 * lead.leader.charisma; }
      else if (this.emergency && this.emergency.by === lead.id && amb > 0) { why = 'emergency'; rate = 0.1; }
      else if (lead.seats >= 67 && amb > 0.45 && this.month - (lead.govSince ?? this.month) >= 96) { why = 'dominant'; rate = 0.07; }
      else if (capt && d.rule !== 'wealth') { why = 'captured'; rate = 0.08; to = IDX.plutocracy; }
    }
    if (why) {
      if (this.erosionBy !== lead.id || this.erosionWhy !== why) {
        const L0 = lead.leader.name, yrs = Math.round((this.month - (lead.govSince ?? this.month)) / 12);
        this.log({
          auth: `Democracy under strain: ${lead.name}, led by ${L0}, begins packing the courts and leaning on the press.`,
          strongman: `Democracy under strain: ${lead.name}, led by ${L0}, begins packing the courts and leaning on the press.`,
          outsider: `Democracy under strain: in power, the outsider ${L0} fires judges, puts friends in charge of the broadcaster and calls critics "enemies of the people".`,
          cult: `Cult of personality: portraits of ${L0} hang in every school and office. ${lead.name} calls its leader the Guardian of the Nation; critics are called traitors.`,
          emergency: `Democracy under strain: ${lead.name} uses its emergency powers against the opposition. Newspapers are shut and protest leaders detained.`,
          dominant: `Democracy under strain: after ${yrs} years in power with ${lead.seats} of 101 seats, ${lead.name} fills the courts, the civil service and the election board with its own people.`,
          captured: `State capture: the ${capt ? capt.name : 'lobby'} owns much of the press and has ${lead.name} in its pocket. Laws are written in its boardrooms.`,
        }[why], 'politics');
      }
      this.erosionBy = lead.id; this.erosionWhy = why; this.erosionTo = to;
      this.erosion = Math.min(1, this.erosion + Math.max(0, rate + 0.12 * this.fear - 0.5 * this.protestFrac) / 12);
      // a constitutional monarch can refuse to sign
      const m = this.monarch;
      if (m && this.erosion > 0.4 && (m.ambition || 0) < 0 && this.month % 12 === 0 && this.rng() < 0.35) {
        this.erosion = Math.max(0, this.erosion - 0.3); this.emergency = null;
        this.log(`${m.name} refuses to sign ${lead.name}'s decrees and reminds the army of its oath to the constitution. The courts take heart.`, 'politics');
      }
      if (this.erosion > 0.8 && this.nextElection - this.month <= 1) {
        this.nextElection += 12;
        this.log(`${lead.name} postpones the election by a year, claiming the country is not ready.`, 'politics');
      }
    } else if (this.erosion > 0) {
      this.erosion = Math.max(0, this.erosion - 0.05 / 12);
      if (this.erosion === 0) { if (this.erosionBy) this.log('The courts and the press have recovered their independence.', 'politics'); this.erosionBy = null; this.erosionWhy = null; }
    }
    if (this.erosion >= SOFT_COUP && lead) {
      // the slide has two steps: a free democracy first becomes a guided one (elections stay, but rigged); a guided one then ends elections
      const nearest = ks => { let to = -1, bd = Infinity; for (const k of ks) { if (k === this.regime) continue; let dd = 0; for (let p = 0; p < NP; p++) dd += (lead.platform[p] - IDEOLOGIES[k].typical[p]) ** 2; if (dd < bd) { bd = dd; to = k; } } return to; };
      const m = this.monarch, royal = m && (m.ambition || 0) > 0.45, LA = lead.arch ? ARCHETYPES[AIDX[lead.arch]] : null;
      const strongman = lead.platform[L.liberty] <= d.lo[L.liberty] + 0.05 && lead.platform[L.police] >= 0.6;
      let to = this.erosionTo;   // an anti-system party's own system, or the oligarchs' plutocracy
      if (royal) to = IDX.absmon;
      if (to < 0 || to === this.regime) {
        if (!d.guided) to = LA && LEFT_KINDS.has(LA.id) ? IDX.popular : IDX.guided;   // the left slides into a popular republic, the rest into a guided democracy
        else if (LA && LA.coupIdx != null && LA.coupIdx !== this.regime) to = LA.coupIdx;
        else to = strongman ? IDX.personal : nearest(HARD_TARGETS);
      }
      const soft = IDEOLOGIES[to].guided && !d.guided;   // into a guided system: a "soft coup" halfway down the road
      if (!soft && this.erosion < 1) return;
      const name = lead.name, leader = lead.leader;
      if (soft) {
        this.log(`Soft coup: ${name} rewrites the constitution. Elections will go on, but ${name} now controls the judges, the TV and the count. Veyland becomes a ${IDEOLOGIES[to].name.toLowerCase()}.`, 'revolution');
        this._changeRegime(to, 'selfcoup'); this.dominant = lead.id;
        return;
      }
      this.log(this.erosionWhy === 'captured' ? `State capture complete: ${name} changes the constitution so that votes count by wealth. Veyland becomes a plutocracy.`
        : royal ? `Royal coup! ${m.name} sides with ${name}, dissolves parliament and rules by decree. Veyland becomes an absolute monarchy.`
        : `Self-coup! After years of eroding the rules, ${name} suspends elections. Veyland becomes a ${IDEOLOGIES[to].name.toLowerCase()} without a shot fired.`, 'revolution');
      this._changeRegime(to, 'selfcoup');
      if (this.faction && IDEOLOGIES[to].rule !== 'crown') { this.faction.name = name; this.faction.leader = leader; }
    }
  }

  /** The army: unhappy officers plus a government that looks weak make a coup plot grow. */
  _armyStep(crime) {
    const a = this.army, P = this.P, r = this.rng, g = this.government, lead = this._lead();
    if (this.month - this.regimeSince < 48) { a.plot = 0; return; }   // a new order has just put its own people in charge of the army
    let n = 0, sour = 0, auth = 0;
    for (const c of this.citizens) if (c.cls === 'official' && !c.jailed) {
      n++; sour += clamp((0.64 - c.s) / 0.2, 0, 1);
      if (AUTHORITARIAN.has(c.fav)) auth += clamp(c.favScore, 0, 1);
    }
    if (!n) return;
    const old = this.Phist.length >= 24 ? this.Phist[0] : null;
    const cut = old ? clamp(3 * (old[L.police] - P[L.police] - 0.05), 0, 0.5) : 0;
    const lw = this.wars[this.wars.length - 1];
    const lost = lw && lw.how === 'defeat' && this.month - lw.to < 60 ? 0.4 : 0;
    const red = lead && ((this.pushesChange(lead.platform) && FAR_LEFT.has(this.aimOf(lead.platform, lead))) || lead.platform[L.state] > 0.55) ? 0.3 : 0;
    a.backers = {
      foreign: !!this.ostria.hardline && (red > 0 || this.tension > 0.4),
      oligarchs: !!lead && this.lobbies[0].money > 2 * this.meanIncome * 12 && (lead.platform[L.tax] > 0.55 || lead.platform[L.state] > 0.4),
      crown: !!this.monarch && (this.monarch.ambition || 0) > 0.45,
    };
    a.mood = (sour + 2 * auth) / n + cut + lost + red + (a.backers.foreign ? 0.2 : 0) + (a.backers.crown ? 0.15 : 0) - (this.month - a.purged < 120 ? 0.3 : 0);
    a.weak = 0.25 * Math.min(4, this.gridlock) + (g.caretaker || g.minority ? 0.3 : 0) + this.crisis + 5 * this.riotFrac + 2 * this.protestFrac + 2 * crime
      + (this.war && this.war.score < -0.3 ? 0.4 : 0) - 2 * (this.meanS - 0.62);
    a.plot = clamp(a.plot * 0.92 + Math.min(0.25, 2 * (Math.max(0, a.mood) * a.weak - 0.05)), 0, 1.2);
    if (a.plot > 0.5 && this.month - a.warned > 60) {
      a.warned = this.month;
      const why = lost ? 'the lost war' : cut ? 'cuts to the army' : red ? 'a government they call "red"' : this.gridlock > 1.5 ? 'endless squabbling in parliament' : this.crisis > 0.4 ? 'the economy' : 'disorder in the streets';
      this.log(`Rumours of a coup: officers grumble openly about ${why}${a.backers.foreign ? `, and ${NEIGHBOUR}n money is said to be reaching them` : ''}.`, 'unrest');
    }
    // a free press may expose the plot first
    if (a.plot > 0.5 && r() < 0.12 * this.press.independent * P[L.liberty]) {
      a.plot = 0; a.purged = this.month;
      this.log('The press uncovers a coup plot. Several generals are retired and the plotters arrested.', 'politics');
      return;
    }
    if (a.plot >= 1 && this.month - a.last > 60) this._coupAttempt();
  }

  _coupAttempt() {
    const a = this.army, P = this.P, r = this.rng, cits = this.citizens, I = this.ideology;
    a.last = this.month; a.plot = 0;
    let join = 0, n = 0, defend = 0, pop = 0;
    const want = new Float32Array(NI), plotters = [];
    for (const c of cits) {
      if (c.jailed) continue; pop++;
      if (c.cls === 'official') {
        n++;
        if (r() < clamp(clamp((0.64 - c.s) / 0.2, 0, 1) + (AUTHORITARIAN.has(c.fav) ? 0.5 : 0) + a.mood - 0.2, 0.05, 0.95)) { join++; plotters.push(c); if (AUTHORITARIAN.has(c.fav)) want[c.fav]++; }
      } else if ((c.fav === this.regime || c.favScore < 0.1) && c.s > 0.45) defend++;   // would stand in front of the tanks
    }
    if (join < 0.2 * n) { a.purged = this.month; this.log('A coup plot fizzles: too few officers will join. The ringleaders quietly retire.', 'politics'); return; }
    const b = a.backers, m = this.monarch;
    const royalNo = m && !b.crown && (m.ambition || 0) < 0.2;
    const x = 8 * (join / n - 0.4) + (b.foreign ? 0.6 : 0) + (b.oligarchs ? 0.3 : 0) + (b.crown ? 1 : 0) - (royalNo ? 1.2 : 0)
      - 4 * (defend / pop - 0.45) * (0.5 + P[L.liberty]) + 1.5 * (a.weak - 0.6);
    const pWin = sig(x), win = r() < pWin;
    const who = b.crown ? `${m.name} and the generals` : 'a group of generals';
    const helped = [b.foreign && `${NEIGHBOUR}n money`, b.oligarchs && "the Industry Council's money"].filter(Boolean).join(' and ');
    if (win) {
      let to = b.crown ? IDX.absmon : IDX.junta, top = -1;
      for (let k = 0; k < NI; k++) if (k !== this.regime && (top < 0 || want[k] > want[top])) top = k;
      if (!b.crown && top >= 0 && want[top] >= 0.4 * plotters.length && IDEOLOGIES[top].rule !== 'crown') to = top;   // the plotters' own cause
      this.log(`Coup! At dawn, tanks surround parliament in Oldbridge. ${Math.round(100 * join / n)}% of officers back ${who}${helped ? `, helped by ${helped}` : ''}. The ${I.name} falls.`, 'revolution');
      this._changeRegime(to, b.crown ? 'royalcoup' : 'putsch');
      if (this.faction) this.log(`The ${this.faction.name} under ${b.crown ? m.name : this.faction.leader.name} dissolves parliament and bans all parties "until order is restored".`, 'repress');
      return;
    }
    for (const c of plotters) if (r() < 0.5) c.jailed = 24;
    a.purged = this.month;
    for (const c of cits) { if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] += 0.04; for (const p of this.parties) if (p.govShare > 0) c.trust[p.id] = clamp((c.trust[p.id] || 0) + 0.05, -1, 1); }
    this.log(`Coup attempt fails! Only ${Math.round(100 * join / n)}% of officers join the plotters, and ${Math.round(100 * defend / pop)}% of citizens pour into the streets${royalNo && m ? `; ${m.name} goes on the radio to condemn the plotters` : ''}. The ringleaders are arrested.`, 'politics');
  }

  /** The free system a country returns to: the democracy that fell, or a liberal democracy. */
  _freeAgain() { return this.fallen && isFree(this.fallen.from) ? this.fallen.from : IDX.democracy; }
  /** A dictatorship that replaced a democracy can end: the generals step down, the ruler dies, ruin discredits them. */
  _restoration() {
    const f = this.fallen;
    if (!f || this.month % 12 !== 3 || this.ideology.electoral) return;
    const r = this.rng, from = f.from;
    let want = 0, offWant = 0, nOff = 0;
    for (const c of this.citizens) { const w = c.judge[from] > c.judge[this.regime]; if (w) want++; if (c.cls === 'official') { nOff++; if (w) offWant++; } }
    want /= this.citizens.length; offWant /= Math.max(1, nOff);
    const yrs = (this.month - this.regimeSince) / 12, fac = this.faction;
    let p = 0, why = '';
    if (this.regime === IDX.junta && yrs >= 4) { p = 0.03 + 0.25 * Math.max(0, want - 0.5); why = 'The generals say order has been restored and go back to their barracks.'; }
    if (fac && this.succession > 0 && 0.25 * want + 0.2 * offWant > p) { p = 0.25 * want + 0.2 * offWant; why = `After the old ruler's death, reformers in the ${fac.name} open talks with the opposition.`; }
    if (fac && yrs >= 5 && this.crisis > 0.5 && fac.approval < 0.4 && 0.1 + 0.2 * offWant > p) { p = 0.1 + 0.2 * offWant; why = 'With the economy in ruins, the regime loses its nerve and negotiates its own exit.'; }
    if (want < 0.4 || r() > p) return;
    this.log(`${why} Free elections are called: Veyland becomes a ${IDEOLOGIES[from].name.toLowerCase()} again.`, 'reform');
    this._changeRegime(from, 'restored');
  }

  /** Old parties whose support is draining may relaunch themselves under a new name. */
  _maybeRebrand() {
    const r = this.rng;
    for (const p of this.parties) {
      const age = (this.month - (p.relaunched ?? p.founded)) / 12;
      if (age < 40 || p.share >= p.lastShare || p.share > 0.25 || r() > 0.25) continue;
      const old = p.name;
      let name;
      for (let t = 0; t < 20; t++) {
        const A = p.arch ? ARCHETYPES[AIDX[p.arch]] : null;
        name = A && A.names.length && t < 12 ? (r() < 0.5 ? 'New ' : '') + A.names[Math.floor(r() * A.names.length)].replace(/^The /, '')
          : (r() < 0.25 ? 'The ' : '') + PARTY_A[Math.floor(r() * PARTY_A.length)] + ' ' + PARTY_B[Math.floor(r() * PARTY_B.length)];
        if (![...this.parties, ...this.deadParties].some(q => q.name === name)) break;
      }
      p.formerNames = (p.formerNames || []).concat(old);
      p.name = name; p.relaunched = this.month; p.leader = this._newLeader(36);
      p.pool = [p.brain, ...Array.from({ length: 5 }, () => this._mutate(p.brain, 0.35))];
      this.log(`Rebrand: the ${age | 0}-year-old ${old}, losing voters, relaunches as ${name} under ${p.leader.name}.`, 'party');
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
    if (this.monarch) {   // a figurehead monarch also grows old
      const m = this.monarch; m.age += 1 / 12;
      if (r() < (m.age < 60 ? 0.0003 : 0.0003 * Math.exp((m.age - 60) / 7))) {
        const old = m.name; this.monarch = this._newMonarch(m.house); this.monarch.age = 18 + r() * 25;
        this.log(`${old} dies. ${this.monarch.name} is crowned.`, 'leader');
      }
    }
    if (this.faction) all.push(this.faction);
    if (this.succession > 0) this.succession--;
    for (const h of all) {
      if (!h.leader) h.leader = this._newLeader();
      const L0 = h.leader;
      L0.age += 1 / 12;
      const pDie = L0.age < 60 ? 0.0003 : 0.0003 * Math.exp((L0.age - 60) / 7);
      if (r() < pDie) {
        if (h === this.faction && L0.royal && this.ideology.elective) {
          // an elective crown: the Diet chooses the next monarch from another great house
          const old = L0.name; h.leader = this._newMonarch(); h.leader.age = 40 + r() * 20;
          if (r() < 0.3) { this.succession = 6; this.log(`${old} dies. The Electoral Diet splits between two great houses; after months of bribes and threats it crowns ${h.leader.name}.`, 'leader'); }
          else this.log(`${old} dies. The Electoral Diet meets and elects ${h.leader.name} as the new monarch.`, 'leader');
        } else if (h === this.faction && L0.royal) {
          // the crown passes to an heir; now and then the succession is disputed
          const old = L0.name; h.leader = this._newMonarch(L0.house); h.leader.age = 18 + r() * 25;
          if (r() < 0.15) { this.succession = 8; this.log(`${old} dies. Rival claimants dispute the throne before ${h.leader.name} is crowned.`, 'leader'); }
          else this.log(`${old} dies. ${h.leader.name} is crowned.`, 'leader');
        } else if (h === this.faction && this.ideology.personal) {
          // a personal dictatorship was built around one person: their death shakes everything
          this.succession = 18;
          for (const c of this.citizens) if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] -= 0.03;
          this._replaceLeader(h, `dies at ${Math.floor(L0.age)} after ${Math.round((this.month - this.regimeSince) / 12)} years in power. Nobody was ever allowed to stand next to them; their heirs and generals fight over what is left`);
        } else if (h === this.faction) {
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
      // the breakaway is the party's purist wing: the same kind of party, further from today's laws on what it was founded for
      let core = null;
      if (party.core) {
        core = Float32Array.from(party.core);
        for (let p = 0; p < NP; p++) core[p] = clamp(core[p] + 0.5 * (ideal[p] - this.P[p]), 0.02, 0.98);
        for (const p of ARCHETYPES[AIDX[party.arch]].lane) core[p] = clamp(core[p] + 0.6 * (core[p] - this.P[p]), 0.02, 0.98);
      }
      const child = this._foundParty(ideal, party.region, party.arch, core);
      if (!child) return;
      const base = party.name.replace(/^The /, '').replace(/^(True|New|Real|Free|Reformed) /, '');
      const name = `${['True', 'New', 'Real', 'Free', 'Reformed'][Math.floor(r() * 5)]} ${base}`;
      if (![...this.parties, ...this.deadParties].some(q => q.name === name)) child.name = name;
      for (const c of unhappy) { c.trust[child.id] = 0.35; c.trust[party.id] = clamp((c.trust[party.id] || 0) - 0.15, -1, 1); }
      this.log(`Split! ${unhappy.length} of ${party.name}'s voters feel the party has sold out what it stood for. Its purist wing, led by ${child.leader.name}, walks out and founds ${child.name}.`, 'party');
      return;
    }
  }
  _maybeMerge() {
    const r = this.rng;
    if (this.parties.length < 5 || r() > 0.5) return;
    const small = this.parties.filter(p => p.share < 0.07 && p.share > 0);
    for (let i = 0; i < small.length; i++) for (let j = i + 1; j < small.length; j++) {
      const a = small[i].share >= small[j].share ? small[i] : small[j], b = a === small[i] ? small[j] : small[i];
      if (a.region !== b.region || enemies(a.arch, b.arch)) continue;
      let d = 0; for (let k = 0; k < NP; k++) d += (a.platform[k] - b.platform[k]) ** 2;
      if (d > 0.3) continue;
      for (const c of this.citizens) {
        c.trust[a.id] = Math.max(c.trust[a.id] || 0, c.trust[b.id] || 0);
        if (c.lastVote === b.id) c.lastVote = a.id;
        if (c.pid === b.id) { c.pid = a.id; c.pidArch = a.arch; }
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
    for (const p of this.parties) if (p.seats > 0 && p.region == null && this.pushesChange(p.platform)) bloc[this.aimOf(p.platform, p)] += p.seats;
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
    if (d.council) {
      const ok = all[k] / Math.max(1, nAll) >= 2 / 3;
      // (checked every three months)
      this.directRun = ok ? { target: k, months: this.directRun && this.directRun.target === k ? this.directRun.months + 3 : 3 } : null;
      if (this.directRun && this.directRun.months === 3) this.log(`Two-thirds of voters now want ${IDEOLOGIES[k].name}. If that lasts two years there will be a referendum.`, 'reform');
      if (this.directRun && this.directRun.months >= 24) this._referendum(k);
    } else if (this.faction) {
      const ok = off[k] / Math.max(1, nOff) >= 0.6 && all[k] / Math.max(1, nAll) >= 0.55 && this.faction.approval < 0.35 && this.month - this.regimeSince >= 60;
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
    // a big group with no party of their kind founds one ("nobody speaks for farmers like us")
    if (reg < 0) {
      const a = this._pickArch(), n = a ? this._unserved(a) : 0;
      if (a && n >= this.citizens.length * 0.08) {
        this.lastFounding = this.month;
        const party = this._foundParty(null, null, a.id);
        if (party) {
          for (const c of this.citizens) if (c.aff[AIDX[a.id]] >= 0.5) c.trust[party.id] = Math.max(c.trust[party.id] || 0, 0.25);
          this.log(`${Math.round(n)} people who feel no party speaks for people like them found ${party.name} (${a.label.toLowerCase()}).`, 'party');
        }
        return;
      }
    }
    if (lonely.length < this.citizens.length * 0.12 && reg < 0) return;
    this.lastFounding = this.month;
    const founders = (reg >= 0 ? lonely.filter(c => c.region === reg) : lonely).slice(0, 40);
    const ideal = new Float32Array(NP);
    for (let p = 0; p < NP; p++) {
      let s = 0; for (const c of founders) s += Math.tanh(c.w[p] * 5);
      ideal[p] = clamp(this.P[p] + 0.35 * s / founders.length, 0.02, 0.98);
    }
    const dir = new Float32Array(NP); for (let p = 0; p < NP; p++) dir[p] = ideal[p] - this.P[p];
    const kind = reg >= 0 ? null : this._archToward(dir);
    const party = this._foundParty(ideal, reg >= 0 ? reg : null, kind ? kind.id : null);
    if (party) {
      for (const c of founders) c.trust[party.id] = 0.3;
      this.log(reg >= 0 ? `${byReg[reg]} people in ${REGIONS[reg].name} feel nobody speaks for their region. They found ${party.name}, which stands only there.`
        : `${lonely.length} citizens feel nobody speaks for them. They found ${party.name}.`, 'party');
    }
  }

  /* ---------------- governing ---------------- */
  _govern() {
    const d = this.ideology, P = this.P;
    if (d.rule === 'lottery' && (this.month - (this.assemblyDrawn ?? -999) >= 24 || !this.assembly.length)) {
      // a new citizens' assembly is drawn by lottery
      this.assembly = this._sample(51).map(c => c.id); this.assemblyDrawn = this.month;
      this.log('A new citizens\' assembly of 51 people is drawn by lottery.', 'politics');
    }
    if (d.council) {
      // every voter pushes each law the way they believe helps them
      let n = 0; const push = new Float32Array(NP);
      const lot = d.rule === 'lottery' ? new Set(this.assembly) : null;
      for (const c of this.citizens) {
        if (d.rule === 'councils' && c.cls === 'owner') continue;
        if (lot && !lot.has(c.id)) continue;
        n++; for (let p = 0; p < NP; p++) push[p] += c.w[p] > 0.03 ? 1 : c.w[p] < -0.03 ? -1 : 0;
      }
      // a law changes only when a clear majority wants it to
      for (let p = 0; p < NP; p++) { const m = push[p] / Math.max(1, n); this.target[p] = clamp(P[p] + (Math.abs(m) > 0.1 ? 0.04 * m : 0), 0, 1); }
    } else if (this.faction && this.month % 12 === (this.regimeSince + 6) % 12) {
      this._factionContest();
    }
    if (d.electoral && this.month >= this.nextElection) this._election();
    if (!d.electoral && this.month % 3 === 0) {
      this._peacefulPressure();
      if (this.regime !== IDX[d.id]) return;     // the system just changed
      if (d.council) this._warPolicy();
    }
    // snap election when the streets are full for three months
    if (d.electoral && !this.government.caretaker) {
      this.unrestRun = this.protestFrac + this.strikeFrac > 0.35 ? this.unrestRun + 1 : 0;
      if (this.unrestRun >= 3 && d.guided && this.month - this.regimeSince > 12) {
        const to = this._freeAgain();
        this.log(`People power! After months of mass protests and strikes, the ruling party gives in and agrees to free elections. Veyland becomes a ${IDEOLOGIES[to].name.toLowerCase()} again.`, 'reform');
        this.unrestRun = -6; this._changeRegime(to, 'reform'); return;
      }
      if (this.unrestRun >= 3 && this.month - this.government.since > 12) {
        this.log('Mass protests bring the government down. A snap election is called.', 'election');
        this.nextElection = this.month + 2; this.unrestRun = -6; this.gridlock += 1;
      }
    }
    // laws take time: the actual laws move toward the government's plan
    for (let p = 0; p < NP; p++) {
      P[p] += (this.target[p] - P[p]) * (d.council ? 0.2 : 0.03);
      P[p] = clamp(P[p], this._lo(p), d.hi[p]);
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
      const base = d.base || { official: 3 };
      for (const c of sample) {
        let k = base[c.cls] || 1;
        for (const id in c.comm) if (base[id]) k = Math.max(k, base[id]);
        s += k * sig(6 * (this.expect(c, plat) + this.warAppeal(c, plat))); w += k;
      }
      if (d.growth) {   // a developmental state also wants growth, judged with the economic model
        const T = this._targets(plat, this._shareTargets(plat), { g: 1, austerity: 0, C: this.C, strikeBoost: 0, strikeFrac: 0, riotFrac: 0 });
        return s / w + 1.5 * (T.E - 1);
      }
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
    if (d.council) {
      let yes = 0, no = 0; for (const c of this.citizens) { if (c.w[W_WAR] > 0.03) yes++; else if (c.w[W_WAR] < -0.03) no++; }
      return yes > no + this.citizens.length * 0.2;
    }
    if (!this.government || this.government.caretaker) return !!this.war && this.war.by === 'them';
    let w = 0; for (const p of this.parties) if (p.govShare > 0) w += p.govShare * (this.wantsWar(p.platform) ? 1 : 0);
    return w > 0.5;
  }
  _warPolicy() {
    let want = this._govWantsWar();
    // a big peace movement on the streets pushes an elected government to make peace
    const peace = (this.members.peace || []).filter(c => c.action).length / this.citizens.length;
    if (this.war && this.ideology.electoral && peace > 0.04) want = false;
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
    for (const c of this.citizens) if (c.cls === 'official' || (c.cls === 'worker' && c.age < 45)) c.veteran = true;
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
    if (!this.inVeyland(k)) return 0;
    const idx = []; this.citizens.forEach((c, i) => { if (c.region === k && filter(c)) idx.push(i); });
    let died = 0;
    for (; died < victims && idx.length; died++) this._replace(idx.splice(Math.floor(r() * idx.length), 1)[0]);
    // good public services and welfare soften the blow
    const care = 1.3 - 0.5 * P[L.services] - 0.3 * P[L.welfare];
    this.hurt[k] = clamp(this.hurt[k] + hurt * care, 0, 1);
    this.debt += cost * 12 * this.Ytot;
    const deaths = died ? `${died === 1 ? 'One person dies' : died + ' people die'}.` : 'No one dies.';
    this.log(text.replace('{died}', died === 1 ? 'one' : died).replace(/\{s\}/g, died === 1 ? '' : 's').replace('{deaths}', deaths).replace('{region}', REGIONS[k].name), 'disaster');
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
      this._disaster(k, anyone, Math.floor(r() * 4), 0.45, 0.01, 'Floods in {region}: thousands of homes are damaged. {deaths}');
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
      this.g -= 0.15; this.A *= 0.98; this.lastCrash = this.month;
      this.log(`Market crash! Banks that lent too freely collapse${reg < 0.35 ? ' (regulation was light)' : ''}. Firms cut jobs.`, 'economy');
    }
    if (r() < 0.0015) { this.g -= 0.06 + 0.1 * P[L.trade]; this.log(`Prices of fuel and raw materials jump around the world${P[L.trade] > 0.6 ? '. Veyland trades a lot, so it is hit hard' : ''}.`, 'economy'); }
    // the great slump: banks fail around the world, and orders stay low for years
    if (this.slump > 0) { this.slump--; this.g = Math.min(this.g, 0.78); }
    else if (r() < 0.0012 * (1.3 - reg)) { this.slump = 30; this.g -= 0.25; this.log('The Great Slump: banks fail around the world and trade collapses. Factories close; queues form at soup kitchens.', 'crisis'); }
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
    this._moreEvents(RG, reg);
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
  /** More of real life: weather, local economies, courts and prisons, crowns and churches, foreign affairs, culture. */
  _moreEvents(RG, reg) {
    const r = this.rng, P = this.P, d = this.ideology, cits = this.citizens, year = 12 * this.Ytot;
    const anyone = () => true, log = (t, k) => this.log(t, k);
    const gov = () => this.parties.filter(p => p.govShare > 0);
    const bump = (k, x) => { if (this.inVeyland(k)) this.boom[k] = Math.min(1, this.boom[k] + x); };
    const hurtAll = x => { for (let k = 0; k < NR; k++) this.hurt[k] = clamp(this.hurt[k] + x, 0, 1); };
    const memAll = x => { for (const c of cits) if (!Number.isNaN(c.memory[this.regime])) c.memory[this.regime] += x; };
    for (let k = 0; k < NR; k++) this.boom[k] *= 0.97;
    // ---- weather and wear ----
    if (r() < 0.0015) {
      this.harvest = Math.min(this.harvest || 1, 0.6);
      this.hurt[RG.Redfield] = clamp(this.hurt[RG.Redfield] + 0.2, 0, 1); this.hurt[RG.Fenwick] = clamp(this.hurt[RG.Fenwick] + 0.15, 0, 1);
      log('A long drought: rivers shrink and crops wither in Redfield and Fenwick.', 'disaster');
    }
    if (r() < 0.0012 * (1.2 - reg)) this._disaster(RG.Fenwick, anyone, Math.floor(r() * 3), 0.35, 0.005, 'Forest fires sweep through {region} and whole villages are evacuated. {deaths}');
    if (r() < 0.0015) this._disaster(RG.Saltmere, anyone, Math.floor(r() * 4), 0.35, 0.01, 'A great storm batters {region}: ships sink and the harbour floods. {deaths}');
    if (r() < 0.0008 * (1.3 - P[L.services])) this._disaster(RG.Oldbridge, anyone, 2 + Math.floor(r() * 6), 0.3, 0.005, `A bridge collapses in {region}, killing {died}.${P[L.services] < 0.35 ? ' Years of neglect are blamed.' : ''}`);
    if ((this.harvest || 1) < 0.7 && P[L.welfare] < 0.25 && this.month % 12 === 2 && r() < 0.5)
      this._disaster(RG.Redfield, c => c.age > 60 && c.needs[0] < 0.45, 3 + Math.floor(r() * 6), 0.5, 0, 'Famine in {region}: {died} of the poorest old people die. Welfare was too thin to help.');
    // ---- local economies ----
    if (r() < 0.0015 * (0.5 + P[L.trade]) && this.inVeyland(RG.Ironvale)) {
      const ws = cits.filter(c => c.region === RG.Ironvale && c.cls === 'worker' && c.employed), n = Math.min(ws.length, 6 + Math.floor(r() * 5));
      for (let i = 0; i < n; i++) ws[i].employed = false;
      this.hurt[RG.Ironvale] = clamp(this.hurt[RG.Ironvale] + 0.25, 0, 1);
      log(`A big factory in Ironvale closes, unable to compete with cheaper imports. ${n} workers lose their jobs.`, 'economy');
    }
    if (r() < 0.0015 * P[L.trade] && !this.war && this.inVeyland(RG.Saltmere)) { bump(RG.Saltmere, 0.3); log("Saltmere's port is booming: ships from half the world queue to unload.", 'economy'); }
    if (r() < 0.001 * P[L.liberty] && !this.war && this.tension < 0.3 && this.inVeyland(RG.Fenwick)) { bump(RG.Fenwick, 0.25); log("Tourists discover Fenwick's forests and villages. Guesthouses fill up.", 'economy'); }
    if (r() < 0.001 * (0.5 + P[L.services])) {
      this.A *= 1.02;
      const low = cits.filter(c => c.cls === 'worker' && c.employed && c.skill < 0.8), n = Math.round(low.length * 0.08);
      for (let i = 0; i < n; i++) low[i].employed = false;
      log(`Automation wave: new machines replace ${n} low-skilled jobs, while firms grow more productive.`, 'economy');
    }
    if (this.debtRatio > 0.7 && P[L.trade] > 0.4 && r() < 0.004) { this.g -= 0.06; hurtAll(0.08); log("Currency crisis: Veyland's crown loses a third of its value. Imported goods become expensive.", 'economy'); }
    if (this.lastCrash != null && this.month - this.lastCrash === 3 && r() < 0.6) {
      this.debt += 0.15 * year;
      for (const c of cits) for (const p of gov()) c.trust[p.id] = clamp((c.trust[p.id] || 0) - 0.05, -1, 1);
      log('The government spends a fortune bailing out the banks. Taxpayers are furious.', 'economy');
    }
    if (!this.oilFound && r() < 0.0003 && this.inVeyland(RG.Saltmere)) {
      this.oilFound = true; this.A *= 1.02; bump(RG.Saltmere, 0.4); this.C = Math.min(1, this.C + 0.03);
      log('Oil is found off the coast of Saltmere. Money pours in, and so do people hoping for a share.', 'economy');
    }
    // ---- courts, prisons, elections ----
    const jailed = cits.filter(c => c.jailed).length / cits.length, rep = P[L.police] * (1 - P[L.liberty]);
    if (P[L.liberty] > 0.5 && this.pending.length >= 2 && r() < 0.003) { this.leak = true; log('A whistleblower leaks a trove of secret documents to the press.', 'politics'); }
    if (d.electoral && this.erosion > 0.25 && this.erosion < 0.7 && r() < 0.01) {
      this.erosion = Math.max(0, this.erosion - 0.15);
      const by = this.parties.find(p => p.id === this.erosionBy);
      log(`The constitutional court strikes down ${by ? by.name + "'s" : 'the government\'s'} attempt to control the judges. Democracy wins a round.`, 'politics');
    }
    if (jailed > 0.02 && P[L.liberty] < 0.5 && r() < 0.01) { memAll(-0.01); log(`Political prisoners go on hunger strike. ${Math.round(jailed * cits.length)} people are behind bars.`, 'unrest'); }
    if (rep > 0.4 && jailed > 0.01 && r() < 0.004) {
      memAll(-0.02); const k = Math.floor(r() * NR); if (this.inVeyland(k)) this.hurt[k] = clamp(this.hurt[k] + 0.05, 0, 1);
      log('A political prisoner dies in police custody. Huge crowds gather at the funeral.', 'unrest');
    }
    if (this.faction && this.faction.approval < 0.4 && jailed > 0.03 && r() < 0.01) {
      const n = cits.filter(c => c.jailed).length; for (const c of cits) c.jailed = 0; memAll(0.01);
      log(`Amnesty: the ${this.faction.name.replace(/^The /, '')} frees ${n} prisoners, hoping to calm the country.`, 'politics');
    }
    // ---- terror: an armed movement strikes (likelier when militias are big and the streets are angry) ----
    { let armed = 0, who = null; for (const id of ARMED) { const n = (this.members[id] || []).length; if (n > armed) { armed = n; who = id; } }
      if (r() < 0.0005 + 0.03 * armed / cits.length + 0.02 * this.riotFrac) {
        const k = Math.floor(r() * NR);
        if (this.inVeyland(k)) {
          this.terror = this.month; this.terrorN = (this.terrorN || 0) + 1;
          const by = who && armed >= 0.02 * cits.length ? `gunmen from the ${COMMUNITIES[CIDX[who]].name.toLowerCase()} bomb` : 'a lone extremist bombs';
          for (const c of cits) if (r() < 0.3) c.w[L.police] += 0.03;   // "we need more police"
          this._disaster(k, anyone, 2 + Math.floor(r() * 8), 0.5, 0.002, `Terror attack in {region}: ${by} a crowded market. {deaths}`);
        }
      } }
    // ---- crowns and churches ----
    const crown = this.monarch || (this.faction && this.faction.leader && this.faction.leader.royal ? this.faction.leader : null);
    if (crown && r() < 0.002) { memAll(0.02); log(`Royal wedding: ${crown.name} marries. Crowds line the streets of Oldbridge.`, 'news'); }
    if (crown && r() < 0.0015 * (0.3 + P[L.liberty])) { memAll(-0.03); log(`A royal scandal: the papers reveal ${crown.name}'s lavish spending.`, 'news'); }
    if (r() < 0.0015) {
      const reform = r() < 0.5;
      for (const c of this.members.church || []) c.w[L.faith] += reform ? -0.02 : 0.02;
      log(reform ? 'The Lantern Church chooses a reforming new High Lamplighter, who says faith belongs in hearts more than in laws.'
        : "The Lantern Church chooses a traditionalist new High Lamplighter, who calls for faith to guide the nation's laws.", 'culture');
    }
    if (r() < 0.001) {
      let n = 0; for (const c of cits) if (c.religious > 0.2 && c.religious < 0.6 && r() < 0.3) { c.religious += 0.1; n++; }
      log(`A charismatic preacher fills stadiums. A wave of religious revival touches ${n} people.`, 'culture');
    }
    // ---- abroad ----
    if (!this.war && r() < 0.0015) { this.tension = Math.min(1, this.tension + 0.25); log(`Spy scandal: ${NEIGHBOUR}n agents are caught photographing army bases.`, 'war'); }
    if (P[L.liberty] > 0.5 && Math.max(...this.hurt) > 0.4 && this.month - (this.news.aid ?? -999) > 60 && r() < 0.1) {
      this.news.aid = this.month; this.debt = Math.max(0, this.debt - 0.02 * year); for (let k = 0; k < NR; k++) this.hurt[k] *= 0.8;
      log('Foreign governments send aid to help rebuild.', 'news');
    }
    if (P[L.liberty] > 0.5 && !this.war && r() < 0.0008) {
      bump(RG.Oldbridge, 0.2); for (const c of cits) for (const p of gov()) c.trust[p.id] = clamp((c.trust[p.id] || 0) + 0.02, -1, 1);
      log('Oldbridge hosts the World Fair. Visitors pour in from abroad.', 'news');
    }
    if (r() < 0.001) {
      const friendlier = r() < 0.5;
      this.tension = friendlier ? Math.max(0, this.tension - 0.3) : Math.min(1, this.tension + 0.3);
      this.ostria.hardline = !friendlier; log(friendlier ? `${NEIGHBOUR} elects a new government that wants better relations with Veyland.` : `A hardline general seizes power in ${NEIGHBOUR} and threatens Veyland.`, 'war');
    }
    // ---- culture ----
    if (r() < 0.006) {
      const k = Math.floor(r() * NR), cu = REGIONS[k].culture;
      if (this.inVeyland(k)) {
        for (const c of cits) if (c.culture === k && c.region === k) c.identity = Math.min(1, c.identity + 0.01);
        const f = cu.festival.replace(/^the /, ''), F = f[0].toUpperCase() + f.slice(1);
        log([`${F} in ${REGIONS[k].name} draws record crowds.`, `${F}: ${cu.people} dance in the streets of ${REGIONS[k].name} until dawn.`, `${F} in ${REGIONS[k].name}: songs in ${cu.dialect.split(',')[0]} ring out all night.`][Math.floor(r() * 3)], 'culture');
      }
    }
    if (r() < 0.001) {
      const k = Math.floor(r() * NR), cu = REGIONS[k].culture, harsh = !d.electoral && P[L.liberty] < 0.3;
      if (this.inVeyland(k)) {
        for (const c of cits) if (c.culture === k) c.identity = Math.min(1, c.identity + (harsh ? 0.05 : 0.02));
        log(harsh ? `The authorities tear down the statue of ${cu.hero} in ${REGIONS[k].name}. ${cu.people} are furious.` : `A statue of ${cu.hero} is unveiled in ${REGIONS[k].name}.`, 'culture');
      }
    }
  }
  _immigrant(s0) {
    const r = this.rng, w = [3, 2, 1, 3, 1, 1];
    for (let k = 0; k < NR; k++) if (!this.inVeyland(k)) w[k] = 0;
    let x = r() * w.reduce((a, b) => a + b, 0), region = 0;
    while (x > w[region]) { x -= w[region]; region++; }
    const c = this._newCitizen(null, 20 + r() * 20, region);
    c.culture = -1; c.identity = 0; c.indep = -0.5;   // from abroad: no province to call their own yet
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
      const st = (d.electoral ? 2 : 0) + (P[L.liberty] > 0.5 ? 1 : 0);
      let a = 0;
      if (r() < 0.15) a = Math.floor(r() * NLA);
      else for (let b = 1; b < NLA; b++) if (l.q[st * NLA + b] > l.q[st * NLA + a]) a = b;
      if (a === 3 && room - owned < 0.02) a = 0;   // nothing left to buy
      if (a === 1 && !d.electoral) a = 2;
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
    const leak = this.leak; this.leak = false;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const b = this.pending[i];
      const taker = b.taker === 'faction' ? this.faction : this.parties.find(p => p.id === b.taker);
      if (!taker || this.month - b.month > 48) { this.pending.splice(i, 1); continue; }
      const rivals = this.lobbies.reduce((t, l) => t + (l.id === b.lobby ? 0 : pr[l.id]), 0);
      if (leak || r() < 0.03 * P[L.liberty] * (pr.independent + 0.7 * rivals)) {
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
    this._communities(false);
    this._economy();
    this._citizens();
    this._unrest();
    this._migration();
    this._internalMigration();
    this._provinces();
    this._govern();
    this._coalitionCheck();
    this._fragility();
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
      if (this.growth < -0.03) this.log(`Recession: the economy shrank ${Math.round(-this.growth * 100)}% this year.`, 'economy');
      else if (this.growth > 0.07) this.log(`Boom year: the economy grew ${Math.round(this.growth * 100)}%.`, 'economy');
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
    } else if (kind === 'langban' || kind === 'secede') {
      // the province with the strongest identity (still in Veyland)
      let k = -1, best = -1;
      for (let j = 0; j < NR; j++) {
        if (!this.inVeyland(j)) continue;
        const p = this.citizens.filter(c => c.region === j && c.culture === j), v = p.reduce((a, c) => a + c.identity, 0) / Math.max(1, p.length);
        if (v > best) { best = v; k = j; }
      }
      if (k < 0) return;
      if (kind === 'langban') {
        this.langBan[k] = 120;
        this.log(`You banned ${REGIONS[k].culture.dialect.split(',')[0]} in ${REGIONS[k].name}'s schools and offices.`, 'culture');
      } else this._secede(k, 'declared independence (you did this)');
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
    for (const k of Object.keys(this)) if (!['rng', '_net', 'members', 'commActive'].includes(k)) state[k] = this[k];   // member lists are rebuilt each month
    state.rngState = this.rng.state();
    return { format: SAVE_FORMAT, formatVersion: 3, app: 'Glass Box', savedAt: new Date().toISOString(), year: Math.floor(this.month / 12), world: encode(state) };
  }
  /** Returns { ok: true, world } or { ok: false, error }. */
  static fromJSON(j) {
    if (!j || j.format !== SAVE_FORMAT) return { ok: false, error: 'Not a Glass Box politics save file.' };
    if (j.formatVersion === 1 || j.formatVersion === 2) return { ok: false, error: 'This country was saved with an older version of Politics (before provincial cultures and the autonomy law were added), so it cannot be opened any more. Sorry!' };
    if (j.formatVersion !== 3) return { ok: false, error: `Unsupported formatVersion ${j.formatVersion}.` };
    try {
      const w = Object.create(World.prototype);
      Object.assign(w, decode(j.world));
      w.rng = makeRng(w.rngState); delete w.rngState;
      // saves from before events existed
      if (!w.hurt) w.hurt = new Float32Array(NR);
      for (const k of ['tension', 'sanctions', 'succession', 'crisis', 'gridlock', 'fear', 'slump']) if (typeof w[k] !== 'number') w[k] = 0;
      if (!w.army) w.army = { plot: 0, mood: 0, weak: 0, warned: -999, purged: -999, last: -999, backers: {} };
      if (w.erosionTo == null) w.erosionTo = -1;
      if (w.terror == null) w.terror = -999;
      if (!w.news) w.news = {};
      // saves from before the newer systems: citizens' memories of systems need room for them
      for (const c of w.citizens) {
        if (c.memory.length < NI) { const m = new Float32Array(NI).fill(NaN); m.set(c.memory); c.memory = m; }
        if (c.judge.length < NI) { const j = new Float32Array(NI); j.set(c.judge); c.judge = j; }
      }
      if (w.dominant === undefined) w.dominant = null;
      w._indexCommunities();
      for (const h of [...w.parties, ...(w.faction ? [w.faction] : [])]) if (!h.leader) h.leader = w._newLeader();
      // saves from before parties had roots: give each party the kind it is closest to, each citizen their sense of "one of us"
      for (const c of w.citizens || []) { if (!c.aff) { c.aff = new Float32Array(NAR); w._refreshAff(c, true); } if (c.pid === undefined) { c.pid = null; c.pidArch = null; c.pidS = 0; } }
      for (const p of [...(w.parties || []), ...(w.deadParties || [])]) if (!p.arch) {
        let best = ARCHETYPES[0], bd = Infinity;
        for (const a of ARCHETYPES) { if (a.regional !== (p.region != null)) continue; let d = 0; for (let q = 0; q < NP; q++) d += (p.platform[q] - a.ideal[q]) ** 2; if (d < bd) { bd = d; best = a; } }
        p.arch = best.id; p.core = Float32Array.from(p.platform.subarray(0, NP));
      }
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

const api = { ARCHETYPES, axes, enemies, isFree, GUIDED, SOFT_COUP, World, POLICIES, NEEDS, IDEOLOGIES, REGIONS, FAMILIES, COMMUNITIES, AUTHORITARIAN, FAR_RIGHT, FAR_LEFT, MONARCHIES, ANARCHIST, ARMED, ACTIONS, FEATURES, BRAIN_SIZES, INPUT_NAMES, OUTPUT_NAMES, LOBBY_ACTIONS, PARTY_COLORS, NEIGHBOUR, W_WAR, OUT_CHANGE, OUT_WAR, familyOf, L };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Politics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
