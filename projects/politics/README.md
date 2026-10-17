# Politics · Veyland

A made-up country of 600 citizens where politics is **learned, not scripted**.
Open `index.html` (double-click works) or use the **Politics** card on the hub.

## What you see

- **Map**: every dot is a citizen. Colour them by vote, happiness, what they're doing (quiet, protesting, striking, rising up), which system they want, or class. Click a dot to look inside their head.
- **Who rules**: the current system, the parliament (when there is one), and the parties. Click a party or the ruler to see its brain.
- **Charts**: wealth, unemployment, happiness, unrest, inequality and corruption over time. The coloured strip shows who ruled. Opinion polls appear below.
- **What people have learned**: what each group believes every law does to them. Everyone started at zero.
- **Which system people would choose**: among liberal democracy, communism, syndicalism, mutualism, distributism, fascism, technocracy, free-market minarchy and military junta.
- **Ostria**: the made-up neighbouring country. You can see its army next to Veyland's, the front line during a war, and past wars.
- **Who owns the press**: independent papers, state media, and the papers each lobby has bought.
- **Regions**: people, happiness, unemployment, emigrants, the leading party and the most wanted other system, per region.
- **Shake things up**: cause a world slump, a bad harvest, an epidemic, an old debt or an attack by Ostria, then watch how people react.
- **New country…**: start under any system, with a seed (same seed, same history).
- **Save / Load…**: download the whole country as a `.json` file and open it again later. It continues exactly where it was.

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
- **Regional parties**: when at least half of a region feels no party speaks for it, a regional party forms (at most two). It stands only at home and gets seats with 20% of its region's vote, even below the national 4% threshold.
- **Emigration and immigration**: people leave when they believe life abroad beats life here by more than their ties (age, property, job). Dictatorships close borders and jail some who try to flee. Emigrants write home six months later, which shapes what their family believes. Immigrants arrive when Veyland looks better than abroad; they know nothing about its politics.
- **Voters** also have a small fixed personal liking for each party, and governing slowly wears a party out, so one party rarely takes over for good.
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
