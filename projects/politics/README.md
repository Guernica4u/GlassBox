# Politics · Veyland

A made-up country of 600 citizens where politics is **learned, not scripted**.
Open `index.html` (double-click works) or use the **Politics** card on the hub.

## What you see

- **Map**: every dot is a citizen. Colour them by vote, happiness, what they're doing (quiet, protesting, striking, rising up), which system they want, or class. Click a dot to look inside their head.
- **Who rules**: the current system, the parliament (when there is one), and the parties. Click a party or the ruler to see its brain.
- **Charts**: wealth, unemployment, happiness, unrest, inequality and corruption over time. The coloured strip shows who ruled. Opinion polls appear below.
- **What people have learned**: what each group believes every law does to them. Everyone started at zero.
- **Which system people would choose**: among liberal democracy, communism, syndicalism, mutualism, distributism, fascism, technocracy, free-market minarchy and military junta.
- **Shake things up**: cause a world slump, a bad harvest, an epidemic or an old debt, then watch how people react.
- **New country…**: start under any system, with a seed (same seed, same history).

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

## The rules of the world (these are fixed, not choices)

- **Economy**: firms (private, state, co-op, small family farms and workshops) produce; wages, profits, taxes, benefits and pensions follow the laws. Unemployment, crime, pollution, inequality, debt and growth respond to the laws in force. A state that borrows too much has a debt crisis and must cut pay and benefits.
- **Systems**: each system fixes some laws (communism: state ownership ≥ 85%, little free speech…) and decides how the rest are made (elections, one party, experts, workers' councils, or direct votes).
- **Force**: if the people (and police) acting for a different system stay stronger than those defending the current one for three months, the government falls. The new system is whatever most rebels wanted. A new regime's supporters defend it hard for its first years.
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

## Ideas for next steps

- Parties that change the system legally (a majority votes to become a distributist or mutualist state).
- Coalition partners that learn whom to join instead of simply picking the closest.
- A press that can be bought; regional parties; emigration; wars with a neighbour.
- Saving and loading a country.
