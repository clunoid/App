/**
 * BEACH RACE — every on-screen string + host voice line, reviewable in one place.
 *
 * COMPLIANCE: copy DESCRIBES what actions do ("Gifts boost your racer") and never
 * solicits ("send a gift…" phrasing is banned). No prize/chance/gambling language.
 * Bots are always presented as bots. Tone: sunny beach-sports commentator.
 */

const mmss = (secs: number): string => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const S = {
  title: "BEACH RACE",
  lobbyLine: (secs: number) => `Starts in ${mmss(secs)}`,
  joinHint: "Comment anything to join the race",
  raceLive: "LIVE",
  podiumTitle: (name: string) => `${name} wins the race!`,
  signage: [
    "Comment anything to join the next race",
    "Gifts boost your racer — bigger gifts, bigger boosts",
    "Likes fill the wave — when it breaks, everyone speeds up",
    "Follow to earn your racer a sun hat",
    "Share the LIVE and a beach ball bounces in",
    "Podium finishes earn championship points",
  ],
  botName: (n: number) => `Sunny Bot ${n}`,
  tickerJoin: (name: string) => `${name} joins the race`,
  tickerBoost: (name: string, tierLabel: string) => `${name} fires a ${tierLabel} boost`,
  tickerWave: () => "The wave breaks — everyone surfs!",
  tickerWin: (name: string) => `${name} takes the checkered flag`,
  tickerHat: (name: string) => `${name} earned a sun hat`,
  gridFullNote: (name: string) => `${name} is in line for the next race`,
};

export const HOST_LINES = {
  raceStart: [
    "Racers on the sand — three, two, one, go!",
    "The tide is out and the track is fast — here we go!",
    "Grid is set, sun is high — let's race!",
    "Toes on the line… and they're off!",
    "Another beach sprint begins — good luck out there!",
  ],
  winner: [
    "{name} takes the checkered flag!",
    "What a run — {name} wins it!",
    "{name} hits the water first — champion!",
    "Give it up for {name}, first to the sea!",
    "{name} owns this beach!",
  ],
  photoFinish: [
    "Photo finish! That was inches!",
    "Too close to call — checking the sand cam!",
    "Wow — decided by a seashell!",
    "That finish was tighter than a beach umbrella in the wind!",
  ],
  boostBig: [
    "{name} just hit the turbo — look at them fly!",
    "Huge boost from {name}!",
    "{name} is absolutely cooking now!",
    "Someone check {name} for rocket fuel!",
    "{name} shifts into beach mode!",
  ],
  takeover: [
    "Unbelievable — {name} brings out the parade!",
    "The whole beach is celebrating {name}!",
    "{name} just made this a festival!",
    "Fireworks for {name} — what a moment!",
  ],
  welcome: [
    "Welcome to the beach, {name}!",
    "{name} gets the sun hat — looking sharp!",
    "New friend on the sand — hey {name}!",
    "{name}, grab a lane, the water's warm!",
  ],
  firstHuman: [
    "A challenger appears — {name} joins the beach!",
    "{name} is here — the race is on!",
    "Make room, bots — {name} wants a lane!",
  ],
  comeback: [
    "The pack is closing in — nobody's safe!",
    "Down but never out on this beach!",
  ],
  ambient: [
    "Perfect day for a race — comment anything to grab a lane.",
    "The bots are warming up the sand — who's joining next?",
    "Championship points on the line every single race.",
    "Waves are rolling, lanes are open.",
    "Somewhere out there is our next champion.",
  ],
};
