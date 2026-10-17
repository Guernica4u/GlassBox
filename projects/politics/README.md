# Politics · Veyland

A made-up country of 600 citizens where politics is **learned, not scripted**.
Open `index.html` (double-click works) or use the **Politics** card on the hub.

## What you see

- **Map**: every dot is a citizen. Colour them by vote, happiness, what they're doing (quiet, protesting, striking, rising up), which system they want, class, faith or movement. Click a dot to look inside their head, or click a region for its **province page** (ages, classes, pay, needs, votes, wishes, communities, news, its happiest and unhappiest people). Scroll to **zoom** (or use + / −) and drag to move; close up, citizens become little figures, and at the closest zoom you can read their names.
- **Who rules**: the current system, the parliament (when there is one), and the parties. Click a party or the ruler to see its brain.
- **Charts**: wealth, unemployment, happiness, unrest, inequality and corruption over time. The coloured strip shows who ruled. Opinion polls appear below.
- **What people have learned**: what each group believes every law does to them. Everyone started at zero.
- **Which system people would choose**: among 21 systems: liberal democracy, constitutional monarchy, federal republic, social republic, plutocracy, sortition, communism, syndicalism, anarcho-communism, mutualism, eco-communalism, distributism, monarcho-distributism, absolute monarchy, national syndicalism, fascism, theocracy, technocracy, developmental state, free-market minarchy and military junta.
- **Regions table and province pages**: each province's culture (speech, festival, folk hero, what its people value), regional identity, autonomy, how many want independence, and where its residents come from. Provinces that leave Veyland are shown as *Free …* on the map.
- **Communities and movements**: who belongs to each, where they live, what they believe, which party they back. Click one for its page.
- **Ostria**: the made-up neighbouring country. You can see its army next to Veyland's, the front line during a war, and past wars.
- **Who owns the press**: independent papers, state media, and the papers each lobby has bought.
- **Regions**: people, happiness, unemployment, emigrants, the leading party and the most wanted other system, per region.
- **Make something happen**: a world slump, market crash, old debt, bad harvest, floods, earthquake, epidemic, an Ostrian attack, refugees, the assassination of whoever leads, banning the most distinct province's language, or that province declaring independence. Then watch how people react.
- **What happened**: the news log, filtered by Politics, Economy, Disasters, War & unrest, or People. Regions recently hit by a disaster are circled on the map.
- **New country…**: start under any system, with a seed (same seed, same history).
- **Save / Load…**: download the whole country as a `.json` file (about 1 MB) and open it again later. It continues exactly where it was. (Files saved before provincial cultures and the autonomy law were added cannot be opened.)

## Who learns what

| Who | Learns | How |
|---|---|---|
| Citizens | what each law does to *them* | each year they compare how their life changed with how the laws changed (a small regression that starts at zero). Neighbours and parents pass on views. |
| Citizens | when to protest, strike or rise up | Q-learning on their own experience: did life get better, did they get arrested? They learn weights for "unhappy", "crowd nearby", "police strength" and "believes in another system". |
| Citizens | whom to trust | trust rises when life gets better while a party governs; scandals wreck it. |
| Parties | which promises win votes | a small neural net (`../embodied-2d/brain.js`) turns the state of the country into promises. Before each election six versions are tested in a poll (a primary); the best leads and the next six are its variations, plus ideas copied from rivals (evolution). |
| Rulers (one-party states, juntas) | how to stay popular with their base | same as parties, tested on their supporters, with police and soldiers counting 3×. |
| Experts (technocracy) | which plan works | same, tested on the economic model. |
| Lobbies | save, donate or bribe? | learn from how their members' lives changed afterwards. |
| Governments | take bribes or not? | learn from whether it later won or lost them support. A free press finds bribes out. |
| Citizens | is war good for me? | the same yearly comparison as for laws: "being at war" is one more thing that changed. |
| Parties and rulers | campaign for a new system? go to war? | two extra outputs of their brain, kept or dropped by the same polls and power struggles as their promises. |
| Lobbies | buy newspapers? | a fourth choice next to save, donate and bribe, learned from how members' lives changed afterwards. |
| Citizens | is life better abroad? | letters home from people who emigrated (and, where the press is free, the news). |

## The rules of the world (these are fixed, not choices)

- **Economy**: firms (private, state, co-op, small family farms and workshops) produce; wages, profits, taxes, benefits and pensions follow the laws. Unemployment, crime, pollution, inequality, debt and growth respond to the laws in force. A state that borrows too much has a debt crisis and must cut pay and benefits.
- **Systems**: each system fixes some laws (communism: state ownership ≥ 85%, little free speech…) and decides how the rest are made (elections, one party, experts, workers' councils, or direct votes).
- **Force**: if the people (and police) acting for a different system stay stronger than those defending the current one for three months, the government falls. The new system is whatever most rebels wanted. A new regime's supporters defend it hard for its first years. Where people can speak freely, taking up arms feels much less justified.
- **Peaceful change (deliberately hard)**:
  - *Elections*: parties holding two-thirds of the seats (67 of 101) must campaign for the same new system, in two parliaments in a row. Then there is a referendum, which needs 60% yes and at least half of people voting.
  - *Workers' councils and assemblies*: two-thirds must want the same new system for two years, then a referendum.
  - *Dictatorships*: round-table talks only if, for a year, 60% of the police and 55% of people want the same system and the regime's approval is under 35%.
  - A peaceful change costs little: nobody is purged and prisoners are freed.
- **War**: Ostria attacks rarely (at least 15 years apart), more often when Veyland looks weak or is in turmoil. Strength = army spending × economy × population × morale. Wars cost output and money; soldiers and young conscripts die. Victory boosts the system's standing; defeat brings reparations and makes people blame the system. Ostria only makes peace when it isn't winning.
- **Press**: where speech is not free, the state runs the media (which never expose the rulers). Lobbies can buy papers; bought papers nudge readers toward what the owner wants and bury the owner's bribes. Only independent papers and rivals expose scandals.
- **Laws**: 14 laws, including *Religion in public life* and *Regional autonomy*. It matters through needs: a church-run public life feels like a cage to the unbelieving and like home to the devout.
- **Needs**: money, health, safety, freedom, fairness, dignity and **belonging** (family and friends, plus the communities someone is part of).
- **New systems**: *national syndicalism* (one nationalist party running the economy through state-controlled unions), *absolute monarchy* (a monarch rules for life; the crown passes to an heir, sometimes disputed), *constitutional monarchy* (elections, with a monarch whose crown adds loyalty), *monarcho-distributism* (a royal order of family farms, workshops, guilds and church), *anarcho-communism* (communes, direct votes, almost no police) and *theocracy* (the Lantern Church's elders rule). Rulers care most about their base: the court looks to police, owners and the faithful, the elders to church members, national syndicalists to workers' clubs and militias.
- **Sects**: about 30 families a party can drift into, from social liberals, eco-socialists, market socialists and libertarian socialists to religious democrats, agrarians, social conservatives, left and right populists, monarchists, national syndicalists and theocrats.
- **Communities**: the Lantern Church (Veyland's made-up old faith), workers' clubs, farmers' co-ops, student societies, business clubs, veterans' and newcomers' associations, and the street movements Anti-fascist Action, patriotic militias, workers' militias and green activists. People join when a community fits them (faith, job, age, beliefs; friends pull too) and keep learning what membership is worth: belonging and ideals, minus time, risk and police attention. Members talk mostly with each other, so opinions form bubbles. Movements bring people onto the streets; militias are armed in uprisings; anti-fascists defend against far-right takeovers; loyal militias defend a regime of their side; rival movements clash in the street. A movement gets less appealing the bigger it already is (its most committed join first). Faith fades slowly outside the church, faster with schooling and free speech.
- **Provincial cultures**: Oldbridge (the capital, Standard Veylish, Founders' Day), Ironvale (factory towns, Furnace Night), Redfield (farmland, devout, the Harvest Fair), Saltmere (the port, the Feast of Tides), Highcombe (mining hills with its own language, Old Combish, and the strongest identity) and Fenwick (forest villages, Midwinter in the Woods). People are born into a culture that tilts what they value, how religious they are and their first hunches. Children usually keep their parents' culture. People move between provinces for jobs and safety, so cultures mix. Identity drifts back toward what is normal in a culture, but grows when a province is left behind, ruled from far away or has its language banned, and fades with national schools and moving away.
- **Autonomy and independence**: people with a strong identity want their province to run its own affairs; without it they start to want independence. Elected governments may grant autonomy (its own assembly and language rights) when their parties' promises favour it or most there want out; dictatorships may ban the language instead. A regional party campaigning for independence that wins half its province's vote calls a referendum (55% yes needed; a liberal democracy usually respects the result, other systems often refuse). Armed separatists may rise up against the police stationed there; if they stay stronger for three months the province breaks away. In testing, autonomy deals were common for Highcombe, bans and rebellions happened under dictatorships, and actual secession was rare.
- **More systems**: *plutocracy* (elections, but a vote counts by how much the voter earns), *sortition* (every two years 51 citizens are picked by lottery to make the laws), *developmental state* (one party chasing growth with open markets), *eco-communalism* (green communes voting on each law), *federal republic* (autonomy guaranteed) and *social republic* (welfare and union rights guaranteed).
- **More sects**: plutocrats, sortitionists, developmentalists, eco-communalists, federalists, social republicans, regionalists, religious socialists, anarcho-capitalists, paleoconservatives, communitarians and technoprogressives (43 in all).
- **More movements and communities**: independence movements, a peace movement (a big one pushes an elected government to make peace), Lantern revivalists, a secular league, monarchist leagues, an anarchist black bloc and a tax revolt; plus sports clubs and heritage societies (which keep a province's identity alive). Movements loyal to the regime's side defend it; the others are hunted where the police are strong. Rivals clash in the street: anti-fascists, the black bloc, workers' militias and separatists against patriots; revivalists against secularists.
- **More events**: droughts, forest fires, storms, bridge collapses (likelier with poor public services), famine (when welfare is thin), factory closures in Ironvale, port and tourism booms, automation waves, currency crises, bank bailouts, offshore oil, whistleblowers, constitutional court rulings, election fraud, hunger strikes, deaths in custody, amnesties, royal weddings and scandals, new heads of the Lantern Church, religious revivals, spy scandals, foreign aid, the World Fair, changes of government in Ostria, festivals with record crowds, statues of folk heroes raised or torn down, and language bans.
- **Parties come and go**: young voters drift away from parties older than about 30 years; old declining parties may rebrand under a new name and leader; there are always at least four parties.
- **Democratic backsliding**: a party with a majority that campaigns for an authoritarian system, or promises minimal freedom and strong police, slowly packs the courts and leans on the press (faster when people are afraid: crime, war, disasters; slower under mass protest). As it goes, free speech can sink below its usual floor, the ruling party gets an unfair edge in elections, and near the end elections are postponed. At 100% there is a self-coup and Veyland becomes the system its promises point to. Losing power reverses it. In testing, about 3 democracies in 8 fell this way within 150 years.
- **Regional parties**: when at least half of a region feels no party speaks for it, a regional party forms (at most two). It stands only at home and gets seats with 20% of its region's vote, even below the national 4% threshold.
- **Emigration and immigration**: people leave when they believe life abroad beats life here by more than their ties (age, property, job). Dictatorships close borders and jail some who try to flee. Emigrants write home six months later, which shapes what their family believes. Immigrants arrive when Veyland looks better than abroad; they know nothing about its politics.
- **Voters** also have a small fixed personal liking for each party, and governing slowly wears a party out, so one party rarely takes over for good.
- **Party life**: 6 parties at the start, up to 8 at once. Every party (and every ruler) has a named **leader** with a charisma that wins or loses votes. Leaders resign after bad results or losing power, retire, have personal scandals (found by a free, independent press) and die. When a dictator dies or is assassinated, a **succession struggle** weakens the police for a while. Big parties **split** when many of their own voters feel abandoned; small, similar parties **merge**. **Coalitions can collapse** between elections (after a scandal, or when a partner's support slumps): the government then finds a new partner, carries on as a minority, or calls a snap election.
- **Events** (chances depend on the laws, nobody is told how to react):
  - mine disasters (Highcombe) and factory fires (Ironvale), likelier with weak safety rules;
  - floods, earthquakes and epidemics. Good public services and welfare soften the blow, and the affected region feels it in safety and money for a while;
  - market crashes (likelier after a boom when regulation is light), price shocks (worse with a lot of trade), world booms, inventions (likelier with good schools and free speech), one-off mineral wealth (with a rise in corruption);
  - border incidents (raise the risk of war), trade deals with Ostria, sanctions on unfree countries, refugee waves;
  - assassination attempts (likelier in turbulent times), sporting and cultural triumphs;
  - news reports of recessions, boom years, crime waves, general strikes and mass protests.
- **Debt**: when debt passes 90% of a year's output, lenders force taxes up and spending down, and taxes may not fall back for five years.
- **Growth**: countries far behind the world's best methods catch up faster, more so with open trade and free speech.
- **Life**: people age, retire at 65 and die; their children take their place, inheriting some beliefs and family stories.
- All names (Veyland, its regions, parties and people) are made up.

## Files

- `sim.js`: the whole simulation. No page code; it also runs in Node: `node -e "const S=require('./sim.js'); const w=new S.World({seed:1}); for(let i=0;i<1200;i++) w.step(); console.log(w.regimeLog)"`
- `index.html`: the page.
- Uses `makeRng` and `Network` from `../embodied-2d/brain.js`, unchanged.

## What to expect

- Comfortable democracies mostly stay democracies. Some fall after decades of bad times.
- Dictatorships are miserable but stable while the police are loyal. Roughly a third fall within a century, usually when police and soldiers start wanting change too.
- Revolutions are messy: they cost output, and people may soon miss the old system.
- Parties drift to new positions over many elections. A party's label ("Social democrats", "Distributists"…) is just the family its promises are closest to right now.
- Peaceful system change is rare by design: most voters prefer the system they know, so campaigning for a new one usually loses votes.
- Wars are rare and mostly costly. Weak, stagnant dictatorships get attacked more and lose more often.
- Dictatorships lose people to emigration; comfortable democracies attract immigrants.

## Ideas for next steps

- Coalition partners that learn whom to join instead of simply picking the closest.
- Ostria as a learning country of its own, and more neighbours.
- Separatist movements in regions.
