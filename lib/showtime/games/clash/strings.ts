/**
 * Clunoid Clash — every on-screen string, in one reviewable place.
 *
 * COMPLIANCE (do not weaken):
 *  - Signage DESCRIBES what actions do ("Gifts fire siege strikes for your team").
 *    It NEVER solicits ("send a gift…" phrasing is banned), and there is no
 *    prize / chance / gambling language anywhere.
 *  - House bots are always visibly labeled BOT (botName).
 *  - HOST_LINES templates may contain {name} and {team} placeholders that the
 *    voice/caption layer substitutes. Tone: playful esports caster.
 */

export const S = {
  idlePrompt: "Attract mode — house bots are sparring to keep the field warm",
  joinHint: "Comment red or blue to enlist",
  signage: [
    "Comments deploy troopers for your team",
    "Comment red or blue to pick your side",
    "Gifts fire siege strikes for your team",
    "Likes charge your team's surge meter",
    "Follows field a recruit — shares call in a squad",
    "First team to five war wins takes the campaign",
  ],
  botName: (n: number) => `BOT-${String(Math.abs(n) % 100).padStart(2, "0")}`,
  tickerGift: (name: string, tierLabel: string) => `${name} fires a ${tierLabel} strike`,
  tickerJoin: (name: string, team: string) => `${name} enlists with ${team}`,
  tickerFollow: (name: string) => `${name} follows in — a recruit takes the field`,
  tickerShare: (name: string) => `${name} shares the war — squad inbound`,
  tickerSurge: (team: string) => `${team} surge — the whole line double-times!`,
  tickerWarWin: (team: string) => `${team} takes the war!`,
  tickerDraw: () => "Dead heat — the war ends in a draw",
};

export const HOST_LINES = {
  warStart: [
    "Horns up — the war is live!",
    "Fresh field, fresh fight. Hold your line!",
    "The front line resets at fifty. Take it and keep it!",
    "Three minutes on the clock. March!",
    "Keeps sealed, banners high — we go again!",
    "New war, clean slate. Who wants the field?",
  ],
  warEndWin: [
    "{team} takes the war! What a push!",
    "The horn sounds and {team} holds the field!",
    "That's a wrap — {team} owns this one.",
    "{team} closes it out. Somebody check on the other keep.",
    "Field to {team}! The campaign board moves.",
    "Ground game, won. {team} stands tall at the horn!",
  ],
  warDraw: [
    "Dead even at the horn — nobody takes it!",
    "A draw! The line simply would not budge.",
    "Split right down the middle. We run it back.",
    "Neither keep blinks. Stalemate!",
    "All that fighting and the map says fifty-fifty. Incredible.",
  ],
  suddenDeath: [
    "Sudden death! First push wins it all!",
    "Too close to call — the next strike takes the war!",
    "One push. That is all it takes now.",
    "Overtime! The whole war balances on a knife's edge.",
    "Thirty seconds, winner-take-all. Do not blink.",
  ],
  campaignEnd: [
    "{team} wins the campaign! Raise the banner!",
    "Five wars. One conqueror. {team}!",
    "The campaign belongs to {team}! Ceremony time.",
    "History gets written in {team} colors tonight!",
    "A full campaign in the books — and {team} is on top of it!",
  ],
  takeover: [
    "{name} goes LEGENDARY — total arena takeover!",
    "Stop everything. {name} just shook the whole field!",
    "A Legend-class strike from {name}! The line never saw it coming!",
    "{name} redraws the front line in a single move!",
    "Seismic! {name} with the biggest strike this arena allows!",
  ],
  strikeBig: [
    "Massive strike from {name} — {team} lurches forward!",
    "{name} drops the hammer for {team}!",
    "Siege fire! {name} rocks the line for {team}!",
    "{name} with the heavy artillery — {team} takes ground!",
    "That impact came from {name}, and {team} felt every bit of it!",
  ],
  welcome: [
    "{name} follows in — welcome to {team}!",
    "A new recruit! {name} marches for {team}!",
    "{name} joins the ranks. {team} grows stronger!",
    "Banner raised for {name} of {team}!",
    "Fresh boots on the ground — {name} reports to {team}!",
  ],
  firstHuman: [
    "A challenger appears — {name} wakes the arena!",
    "{name} is here! Bots, clear the lanes!",
    "The stands stir. {name} steps onto the field!",
    "We have a live one — {name} takes the field!",
    "Lights up! {name} just ended attract mode!",
  ],
  comeback: [
    "{team} digs in — the comeback is armed!",
    "Backs to the keep, {team} fights harder!",
    "Never count out {team} — the rally is on!",
    "{team} finds another gear with the wall behind them!",
    "Cornered and dangerous — that's {team} right now!",
  ],
  ambient: [
    "The line holds... for now.",
    "Troopers trading ground in the mid-field.",
    "Both keeps watching. Both keeps waiting.",
    "Every comment is another boot on the ground.",
    "The surge meters are humming tonight.",
    "Somewhere out there, a strategist is typing 'red'.",
    "Territory is rented in this arena. Nobody owns it for long.",
  ],
};
