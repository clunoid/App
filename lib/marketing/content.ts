import type { Metadata } from "next";

/**
 * Content model for Clunoid's PUBLIC, crawlable marketing pages. Each page is a
 * static server-rendered route under `app/<slug>/page.tsx` that renders the
 * shared <FeaturePage> template with one of these entries. Everything here is
 * indexable; the CTAs link to the sign-in gate (openAuth), so clicking through
 * from a search result never bypasses authentication.
 *
 * Copy rule: describe only features that actually ship. No invented numbers,
 * specs, or capabilities.
 */

export type Accent = "clay" | "spark";

export type Section = {
  heading: string;
  body: string;
  bullets?: string[];
};

export type FaqItem = { q: string; a: string };

/** Ordered how-to steps — rendered as a list and emitted as HowTo structured data. */
export type Step = { name: string; text: string };

/** A comparison table (e.g. Clunoid vs ChatGPT). */
export type Comparison = {
  otherName: string;
  rows: { label: string; clunoid: string; other: string }[];
};

export type MarketingPage = {
  slug: string; // route path WITHOUT leading slash, e.g. "stat-battles"
  nav: string; // short label for nav/footer
  category?: "feature" | "resource"; // feature = shown in the homepage grid + main nav
  metaTitle: string; // <title> — keyword-rich, ~50-60 chars
  metaDescription: string; // ~150-160 chars
  keywords: string[]; // page keyword cluster (long-tail included)
  accent: Accent;
  eyebrow: string; // small kicker above the H1
  h1: string;
  heroSub: string; // 1-2 sentence subhead
  sections: Section[];
  steps?: Step[]; // optional how-to (adds HowTo JSON-LD)
  stepsHeading?: string;
  comparison?: Comparison; // optional comparison table
  faq: FaqItem[];
  ctaTitle: string;
  ctaSub: string;
};

const BASE = "https://clunoid.com";

/** Per-page <Metadata>, derived from the content (canonical, OG, keywords). */
export function buildMeta(page: MarketingPage): Metadata {
  const url = `${BASE}/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    keywords: page.keywords,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      type: "website",
      url,
      siteName: "Clunoid",
      title: page.metaTitle,
      description: page.metaDescription,
    },
    twitter: {
      card: "summary_large_image",
      title: page.metaTitle,
      description: page.metaDescription,
    },
  };
}

export const PAGES = {
  // ── Features hub ──────────────────────────────────────────────────────────
  features: {
    slug: "features",
    nav: "Features",
    category: "feature",
    metaTitle: "What Is Clunoid? AI Host, Charts, Game & Videos",
    metaDescription:
      "Clunoid is an AI host you talk to. Ask Isaac anything and see it answered with visuals, build bar-chart-race videos, play a flag game, and export shareable clips. Free, no download.",
    keywords: [
      "Clunoid", "what is Clunoid", "Clunoid app", "Clunoid review", "Clunoid pricing", "how does Clunoid work",
      "is Clunoid free", "Clunoid vs ChatGPT", "Clunoid features", "AI app features", "all-in-one AI tool",
      "AI host", "AI host app", "ask AI anything", "talk to AI by voice", "AI that shows you anything",
      "AI app that answers with visuals", "AI that researches and shows answers", "bar chart race maker",
      "stat battle", "guess the country game", "AI flag quiz game", "AI voice generator", "recap video maker",
      "make AI videos for TikTok free", "AI captions", "data visualization video", "PDF to chart", "what can Clunoid do",
    ],
    accent: "clay",
    eyebrow: "Everything Clunoid does",
    h1: "One AI host. Answers, data races, a game and videos.",
    heroSub:
      "Clunoid is an AI you talk to. Ask Isaac anything and watch it answered with visuals, turn any topic or file into an animated Stat Battle, play Guess the Country, and export shareable videos — all in one place, free to start, nothing to download.",
    sections: [
      {
        heading: "Ask Isaac anything",
        body: "Type or speak any question and Isaac, your super-intelligent AI host, researches it and shows you the answer with synced animated visuals and an at-a-glance info card. Then keep the conversation going with follow-ups.",
        bullets: [
          "Voice or text — talk to the AI like a person",
          "Web-grounded answers with animated explainers",
          "Suggested follow-ups to keep exploring",
        ],
      },
      {
        heading: "Build animated Stat Battles",
        body: "Turn any ranking that changes over time — or your own PDF, CSV and documents — into an animated bar-chart-race video that Isaac narrates. Perfect for data storytelling and social posts.",
        bullets: [
          "From a prompt or your own PDF/CSV/Excel file",
          "Narrated automatically by your chosen voice",
          "Export as a video to share",
        ],
      },
      {
        heading: "Play, listen, and share",
        body: "Play Guess the Country, the voice-hosted flag quiz, choose the AI host voice you like best, and export what you make as a vertical or wide recap video with AI-written titles, captions and hashtags. HD export is free.",
        bullets: [
          "Guess the Country flag game, hosted out loud",
          "Choose your AI voice, or mute it",
          "Vertical 9:16 and wide 16:9 video export",
        ],
      },
    ],
    faq: [
      { q: "What is Clunoid?", a: "Clunoid is an AI host you talk to. Ask Isaac anything and he answers out loud with synced animated visuals; you can also build animated bar-chart-race videos, play the Guess the Country flag game, and export shareable clips — all in your browser." },
      { q: "Is Clunoid free?", a: "Yes — you can start for free, ask Isaac questions, play the game and export HD videos. Paid plans and pay-as-you-go credits unlock more usage and Isaac's premium voice." },
      { q: "How is Clunoid different from ChatGPT?", a: "Instead of plain text, Isaac answers out loud with synced animated visuals and an info card, and you can talk to him by voice. Clunoid also builds bar-chart-race videos, hosts a flag game, and exports shareable clips. See our Clunoid vs ChatGPT comparison for details." },
      { q: "What can Clunoid do?", a: "Answer any question with visuals, build animated bar-chart-race Stat Battles from topics or your files, host the Guess the Country flag game, read everything aloud in your chosen AI voice, and export shareable recap videos with AI captions." },
      { q: "Do I need to install anything?", a: "No. Clunoid runs in your browser on desktop and mobile — nothing to download." },
      { q: "Can I make videos for TikTok, Reels and Shorts?", a: "Yes. Export vertical (9:16) or wide (16:9) recap videos with AI-generated titles, captions and hashtags, ready to share." },
    ],
    ctaTitle: "Meet Isaac",
    ctaSub: "Ask your first question free — the harder, the better.",
  },

  // ── Isaac / ask anything ────────────────────────────────────────────────
  isaac: {
    slug: "isaac",
    nav: "Isaac",
    category: "feature",
    metaTitle: "Isaac — Talk to an AI That Answers Out Loud, Free",
    metaDescription:
      "Isaac is Clunoid's AI host. Ask anything by voice or text and get a spoken, web-grounded answer with synced animated visuals and an info card. A ChatGPT-style AI that talks. Free, no install.",
    keywords: [
      "Isaac AI", "talk to AI", "ask AI anything", "AI that shows you anything", "AI that answers out loud",
      "talking AI", "AI that talks back", "AI host", "voice AI", "hands-free voice AI", "conversational AI",
      "AI assistant", "free AI assistant", "AI explainer", "AI answers with visuals", "AI that explains with animation",
      "AI search", "AI with live web search", "real-time AI", "AI that knows current events", "learn anything",
      "AI tutor", "ChatGPT alternative with visuals", "AI like ChatGPT but talks", "ask AI questions out loud",
      "how to talk to an AI by voice", "AI chat history", "voice assistant for the web",
    ],
    accent: "clay",
    eyebrow: "Meet your AI host",
    h1: "Talk to Isaac — an AI that shows you anything.",
    heroSub:
      "Ask any question by voice or text. Isaac researches it and answers out loud while synced animated visuals and an info card appear on screen — a ChatGPT-style AI that actually talks back. Curious about a person, a place, today's news or a hard idea? Just ask.",
    sections: [
      {
        heading: "Ask anything, by voice or text",
        body: "Speak naturally or type — Isaac listens, thinks it through and replies out loud like a knowledgeable friend. The harder the question, the better. It's an AI you actually talk to, not a search box, and it works in your browser on desktop and mobile.",
        bullets: [
          "Natural voice conversation with an AI host",
          "Type instead any time — your choice",
          "Follow-up questions keep the thread going",
        ],
      },
      {
        heading: "Answers you can see",
        body: "Every answer comes with synced animated media on one side and an at-a-glance info card on the other, so you understand it instead of just reading a wall of text. It's a visual AI explainer for anything you're curious about.",
      },
      {
        heading: "Grounded and current",
        body: "Isaac researches with live web sources before he speaks, so answers reflect what's true now — current officeholders, ongoing events and up-to-date facts — not last year's snapshot.",
      },
      {
        heading: "Keep exploring",
        body: "Each answer suggests where to go next, and your history is saved so you can pick any topic back up. It's a faster, friendlier way to learn anything.",
      },
    ],
    faq: [
      { q: "What is Isaac?", a: "Isaac is Clunoid's AI host — a super-intelligent assistant you talk to by voice or text. Ask anything and Isaac answers out loud with synced animated visuals and an info card." },
      { q: "Is it like ChatGPT?", a: "It's a ChatGPT-style AI, but instead of plain text you get a spoken answer plus synced visuals and a structured info card, and you can talk to Isaac hands-free by voice." },
      { q: "Can I use it by voice?", a: "Yes. Tap the mic and just talk — Isaac listens, researches and replies aloud. You can also type at any time." },
      { q: "Do I need to download or install anything?", a: "No. Isaac runs in any modern browser on desktop and mobile — there's nothing to install." },
      { q: "Are the answers up to date?", a: "Isaac grounds answers in live web research before responding, so they reflect current facts and ongoing events." },
      { q: "Does Isaac save my conversations?", a: "Yes — your history is saved to your account so you can reopen any past answer and keep exploring." },
      { q: "Is Isaac free to use?", a: "Yes — you can start asking for free. Paid plans and credits add more usage and keep Isaac's premium voice hosting you." },
    ],
    ctaTitle: "Ask Isaac your first question",
    ctaSub: "It's free to start — the harder the question, the better.",
  },

  // ── Stat Battles / bar chart race ────────────────────────────────────────
  "stat-battles": {
    slug: "stat-battles",
    nav: "Stat Battles",
    category: "feature",
    metaTitle: "Free Bar Chart Race Maker — Stat Battle Videos",
    metaDescription:
      "Make animated bar-chart-race videos free. Type a ranking or upload a PDF, CSV or Excel file and Clunoid builds a narrated Stat Battle for TikTok, Reels and Shorts. No code, no software.",
    keywords: [
      "bar chart race", "bar chart race maker", "bar chart race generator", "bar chart race generator free",
      "animated bar chart race", "how to make a bar chart race", "how to make a racing bar chart", "racing bar chart maker online free",
      "bar chart race from CSV", "Excel to bar chart race", "bar chart race no code", "bar chart race template",
      "data race video", "stat battle", "ranking over time", "animated ranking video maker", "data visualization video",
      "statistics video", "data storytelling", "narrated data visualization video", "PDF to chart", "CSV to chart",
      "spreadsheet to chart", "turn data into video", "infographic video maker", "data video for social media",
      "bar chart race for TikTok", "bar chart race video for Instagram Reels", "flourish bar chart race alternative", "free flourish alternative",
    ],
    accent: "spark",
    eyebrow: "Animated data, narrated",
    h1: "Stat Battles — turn any ranking into a bar-chart-race video.",
    heroSub:
      "Ask for a ranking that changes over time, or upload your own data, and Clunoid builds an animated bar-chart-race video that Isaac narrates. Watch the leaders overtake each other, then export it to share — no code, no spreadsheets, no animation software.",
    sections: [
      {
        heading: "From a prompt or your own file",
        body: "Type something like \"largest economies since 1960\" or \"most-subscribed YouTube channels,\" or upload a PDF, CSV, Excel or spreadsheet. Clunoid reads it, finds the data, and builds the race for you — no spreadsheets, no animation software, no code.",
        bullets: [
          "Any topic: economies, populations, sports, companies, medals",
          "Or bring your own PDF, CSV or Excel spreadsheet",
          "Built and grounded by the AI, not hand-animated",
        ],
      },
      {
        heading: "Watch the race unfold",
        body: "Bars grow, reorder and overtake each other across time while Isaac narrates the story behind the numbers. It's data visualization that actually holds attention — perfect for explaining a trend at a glance.",
      },
      {
        heading: "Export and share",
        body: "Turn your Stat Battle into a vertical or wide recap video with an AI-written title, captions and hashtags, then post it to TikTok, Reels, Shorts or X. HD export is free.",
      },
    ],
    faq: [
      { q: "What is a bar chart race?", a: "A bar chart race is an animated chart where bars representing items (countries, companies, players) grow and reorder over time, showing how a ranking changes. Clunoid builds them automatically and narrates them." },
      { q: "How do I make a bar chart race?", a: "Just describe the ranking you want — for example \"top economies since 1960\" — or upload a PDF, CSV or Excel file. Clunoid finds the data and builds the animated race for you, then lets you export it as a video. No code or chart software needed." },
      { q: "Can I use my own data from Excel or CSV?", a: "Yes. Upload a PDF, CSV, Excel or spreadsheet and Clunoid turns it into a Stat Battle you can watch and share." },
      { q: "Is this a free alternative to Flourish?", a: "Clunoid builds the bar chart race for you from a prompt or your file and narrates it automatically, and HD export is free to start — so it's a fast, AI-powered alternative when you don't want to wire up data by hand." },
      { q: "Can I post the video to social media?", a: "Yes — export a vertical (9:16) or wide (16:9) video with AI titles, captions and hashtags, ready for TikTok, Reels, YouTube Shorts and X." },
    ],
    ctaTitle: "Build your first Stat Battle",
    ctaSub: "Describe a ranking or upload a file — it's free to start.",
  },

  // ── Guess the Country / flag quiz ────────────────────────────────────────
  "guess-the-country": {
    slug: "guess-the-country",
    nav: "Guess the Country",
    category: "feature",
    metaTitle: "Guess the Country — Free Flag Quiz Game (Voice)",
    metaDescription:
      "Play Guess the Country, a free flag quiz hosted by Isaac's real voice. Answer by speaking or typing, pick any region or difficulty, and learn the world's flags. Great for students and trivia fans.",
    keywords: [
      "guess the country", "guess the country by flag", "flag quiz", "flag quiz with voice", "voice flag game",
      "flag game", "country quiz", "world flags game", "world flags game online", "guess the flag", "identify the flag",
      "name the country by flag", "geography game", "geography quiz game", "flag trivia", "learn the flags",
      "flags of the world quiz", "national flags quiz", "hard flag quiz", "European flag quiz", "Asian flag quiz",
      "African flag quiz", "flag quiz for kids", "flag quiz for students", "classroom flag quiz", "daily flag quiz",
      "Sporcle flag quiz alternative", "Seterra flags alternative", "AI trivia game",
    ],
    accent: "clay",
    eyebrow: "A game Isaac hosts",
    h1: "Guess the Country — the flag quiz Isaac hosts out loud.",
    heroSub:
      "See a flag, name the country. Isaac reads each round in his real voice and you answer by speaking or typing. Ask for any region, difficulty or length and a fresh quiz is built just for you — it never repeats.",
    sections: [
      {
        heading: "Your quiz, your rules",
        body: "Ask for \"hard European flags, 20 rounds,\" \"relaxed world flags,\" or just \"random\" — Clunoid builds a fresh round set every time, validated against real country data, so it's always accurate and never the same twice. Try an Asian, African or Americas flag quiz, or take on the hardest flags.",
        bullets: [
          "Any region: World, Europe, Asia, Africa, the Americas",
          "Pick the difficulty and how many rounds",
          "Answer by voice or by typing",
        ],
      },
      {
        heading: "Hosted by Isaac's real voice",
        body: "Isaac reads each question aloud and calls out the answer on the reveal, like a game-show host. Speak your answer or type it — the game accepts close matches and common name variations. Get it right and your score climbs.",
      },
      {
        heading: "Learn the world's flags",
        body: "It's a fun, fast way to get better at world geography and flag recognition — great for students, classrooms, trivia fans and anyone who likes a quick daily challenge. Because every quiz is generated fresh, there's always a new round to play.",
      },
    ],
    faq: [
      { q: "How do you play Guess the Country?", a: "A flag appears, and you name the country by speaking or typing your answer. Isaac reads each round aloud and reveals the correct answer, and your score updates as you go." },
      { q: "Can I answer by voice?", a: "Yes — speak your answer or type it. The game accepts close matches and common country name variations, so you don't have to be exact." },
      { q: "Is the flag quiz free?", a: "Yes, Guess the Country is free to play. A host voice reads each round; Isaac's premium voice comes with a subscription or credits, and free voices are always available." },
      { q: "Can I choose the region or difficulty?", a: "Yes. Ask for any region (Europe, Asia, Africa, the Americas, or the whole world), set the difficulty, and choose how many rounds — from a quick game to a long challenge." },
      { q: "How is this different from other flag quizzes?", a: "Clunoid generates a fresh, validated quiz every time so it never repeats, Isaac hosts it out loud in his real voice, and you can answer by speaking — not just clicking — which most flag quizzes don't offer." },
      { q: "Is it good for kids, students or the classroom?", a: "Absolutely. The big reveal, voice answering and Isaac's narration make Guess the Country a memorable, hands-free way for students to learn the world's flags and countries." },
    ],
    ctaTitle: "Play Guess the Country",
    ctaSub: "Free to play — pick a region and start guessing.",
  },

  // ── Recap / social videos ────────────────────────────────────────────────
  "recap-videos": {
    slug: "recap-videos",
    nav: "Recap Videos",
    category: "feature",
    metaTitle: "Free AI Recap Video Maker — Captions & Voiceover",
    metaDescription:
      "Turn a Stat Battle or game result into a recap video with AI titles, captions, hashtags and voiceover. Export 9:16 or 16:9 for TikTok, Reels and Shorts. Free HD export, no editing, no watermark.",
    keywords: [
      "recap video maker", "AI video maker", "free recap video maker", "free video maker no watermark", "AI video maker free",
      "social media video maker", "TikTok video maker", "how to make a recap video for TikTok", "Reels maker", "Instagram Reels maker",
      "YouTube Shorts maker", "export video for YouTube Shorts free", "video with AI voiceover", "add AI voiceover to a video",
      "AI captions", "AI caption generator for social videos", "auto caption video", "add captions to video automatically",
      "burned-in captions", "subtitles for muted video", "AI hashtag generator", "vertical video maker", "9:16 vs 16:9 video export",
      "best aspect ratio for TikTok", "data video maker", "bar chart race to TikTok video", "game highlight video", "video maker no editing required",
    ],
    accent: "spark",
    eyebrow: "Made for sharing",
    h1: "Recap videos with AI titles, captions and voiceover.",
    heroSub:
      "Turn what you make in Clunoid — a Stat Battle, a game result — into a polished recap video. Clunoid writes the title, captions and hashtags, narrates it in your chosen voice, and exports it ready to post. No editing, no watermark.",
    sections: [
      {
        heading: "One tap from creation to clip",
        body: "Made a Stat Battle or finished a game? Export it as a recap video without leaving Clunoid. There's no timeline to edit and no editing skills required — the AI writes the title, captions and hashtags for you.",
        bullets: [
          "AI-written title, captions and hashtags",
          "Narrated by your chosen AI voice",
          "Vertical (9:16) and wide (16:9) formats",
        ],
      },
      {
        heading: "Sized for every platform",
        body: "Export a vertical 9:16 video for TikTok, Instagram Reels and YouTube Shorts, or a wide 16:9 video for YouTube and X. Captions and subtitles are baked in so it plays well even on mute.",
      },
      {
        heading: "Free HD export, premium voices saved",
        body: "Exporting in HD is always free, with no watermark. When you render a video with a premium voice, Clunoid saves it to your history so you can re-download it any time and never have to re-create it — keeping your credits for new ideas.",
      },
    ],
    faq: [
      { q: "What can I make recap videos of?", a: "Any Stat Battle (bar-chart-race) or game result in Clunoid can be exported as a recap video with AI titles, captions, hashtags and voiceover." },
      { q: "How do I make a recap video for TikTok?", a: "Create a Stat Battle or finish a game, tap Export, choose the vertical 9:16 format, and share — Clunoid writes the title, captions and hashtags and narrates it for you." },
      { q: "Is exporting videos free, and is there a watermark?", a: "HD export is always free with no watermark. Premium AI voiceover uses credits, and those premium videos are saved so you don't have to render them again." },
      { q: "Should I use 9:16 or 16:9?", a: "Use vertical 9:16 for TikTok, Instagram Reels and YouTube Shorts; use wide 16:9 for YouTube and X. Clunoid exports both." },
      { q: "Do the videos have captions and subtitles?", a: "Yes — captions are generated automatically and baked into the video so it's clear even when watched on mute." },
      { q: "Who writes the title and hashtags?", a: "Clunoid's AI writes the title, captions and hashtags for you, tuned for the platform you're sharing to." },
    ],
    ctaTitle: "Make a recap video",
    ctaSub: "Create something in Clunoid, then export it to share — free.",
  },

  // ── AI voices ──────────────────────────────────────────────────────────────
  "ai-voices": {
    slug: "ai-voices",
    nav: "AI Voices",
    category: "feature",
    metaTitle: "AI Voice & Narration — Choose Your Host Voice | Clunoid",
    metaDescription:
      "Choose the AI voice that reads everything to you in Clunoid. Pick Isaac's natural premium voice or a free Clunoid Voice, preview before you choose, mute any time, and use it for video narration.",
    keywords: [
      "AI voice", "AI voices", "AI host voices", "AI narration", "AI narrator", "text to speech", "text to speech online free",
      "free TTS voice", "TTS voices", "AI voice generator", "free AI voice generator", "voice over generator free", "AI voiceover",
      "AI voice for video narration", "narrator voice for videos", "AI voices that sound human", "realistic AI voice", "natural text to speech",
      "AI voice reader for documents", "text reader voice", "choose AI voice", "preview AI voice", "how to change AI voice",
      "how to mute AI voice", "male AI voice", "female AI voice", "voice host", "AI speech",
    ],
    accent: "clay",
    eyebrow: "Pick a voice you love",
    h1: "AI voices — choose the host that reads to you.",
    heroSub:
      "Clunoid talks. Choose Isaac's natural-sounding premium voice or one of the free Clunoid Voices, preview each one, and that voice hosts your answers, your games and your video narration. Prefer quiet? Mute it.",
    sections: [
      {
        heading: "A voice for everything",
        body: "Your chosen voice reads Isaac's answers, hosts Guess the Country, and narrates the recap videos you export. It's text-to-speech built into everything — and if you'd rather read in silence, mute the host entirely or fall back to your browser's built-in voice.",
        bullets: [
          "Isaac's natural premium voice, plus free Clunoid Voices",
          "Preview any voice before you choose",
          "Browser fallback voice and a full mute option",
        ],
      },
      {
        heading: "Preview, then pick",
        body: "Hear a sample of each voice before you commit, and change your voice any time in settings. Your choice is remembered — and your video-narration voice is remembered separately, so creating clips is one less decision.",
      },
      {
        heading: "Premium narration for videos",
        body: "Use Isaac's realistic, natural-sounding premium voice to narrate your Stat Battles and recap videos for a polished, professional result. Premium-voice videos are saved to your history so you never re-render the same clip.",
      },
    ],
    faq: [
      { q: "What are Clunoid Voices?", a: "Clunoid Voices are the AI host voices you can choose from to read everything to you — including Isaac's premium voice and a set of free voices, plus a browser fallback and a mute option." },
      { q: "Is there a free text-to-speech voice?", a: "Yes. The free Clunoid Voices and the browser fallback are free text-to-speech; Isaac's premium voice uses credits or a subscription for the most natural narration." },
      { q: "Can I preview the voices?", a: "Yes — preview a sample of each voice in settings before you pick, and change your choice any time." },
      { q: "How do I change my AI voice?", a: "Open settings, preview the voices, and pick the one you like — your choice is remembered, and you can set a separate voice just for video narration." },
      { q: "Can I use a different voice for video narration?", a: "Yes. Clunoid remembers your video-narration voice separately from your everyday host voice, so your clips always sound the way you want." },
      { q: "Can I turn the voice off?", a: "Yes. You can mute the host entirely for quiet use, which also saves credits." },
      { q: "Can I upload or clone my own voice?", a: "Not currently — Clunoid offers a curated set of host voices (Isaac's premium voice plus free Clunoid Voices), not custom voice cloning or uploads." },
    ],
    ctaTitle: "Choose your voice",
    ctaSub: "Preview the voices and start free.",
  },

  // ── File analyzer ──────────────────────────────────────────────────────────
  "file-analyzer": {
    slug: "file-analyzer",
    nav: "File to Chart",
    category: "feature",
    metaTitle: "PDF, Excel & CSV to Bar Chart Race Video — Free | Clunoid",
    metaDescription:
      "Upload a PDF, CSV, Excel or spreadsheet and Clunoid turns it into a narrated bar-chart-race video you can share. AI data storytelling from your own files. Free to start, no formulas.",
    keywords: [
      "PDF to chart", "PDF to video", "make a video from a PDF", "free PDF to video maker", "CSV to chart", "CSV to bar chart race",
      "CSV to video", "Excel to bar chart race", "Excel to video", "xlsx to bar chart race", "convert Excel data to animated chart",
      "Google Sheets to chart video", "spreadsheet to chart", "turn a spreadsheet into a video", "how to turn a spreadsheet into a video",
      "document to chart", "turn a report into a video", "turn financial report into video", "data storytelling", "visualize CSV",
      "chart from data file", "AI data analysis", "AI tool to visualize my own data", "data to social video", "bar chart race", "is my uploaded data private",
    ],
    accent: "spark",
    eyebrow: "Your data, animated",
    h1: "Turn your PDFs and spreadsheets into bar-chart-race videos.",
    heroSub:
      "Upload a PDF, CSV, Excel or document and Clunoid reads the numbers and builds an animated bar-chart-race video from them — narrated and ready to share. Works best with files that hold a ranking or values over time. Data storytelling without a spreadsheet in sight.",
    sections: [
      {
        heading: "Drop in a file, get a story",
        body: "Bring a PDF report, a CSV export, an Excel file or a spreadsheet. Clunoid extracts the data, figures out the ranking and timeline, and builds a Stat Battle video around it — no formulas, no chart tools, no code. It works best when your file contains a ranking or values that change over time.",
        bullets: [
          "Works with PDFs, CSVs, Excel and spreadsheets",
          "Finds the ranking and timeline automatically",
          "Narrated by your chosen AI voice",
        ],
      },
      {
        heading: "Made to share",
        body: "Export the result as a vertical or wide recap video with an AI-written title, captions and hashtags — perfect for turning a dry report into something people actually watch.",
      },
      {
        heading: "For reports, classes and content",
        body: "Whether you're presenting results, teaching a trend or posting to social, Clunoid makes your own data move. It's the fastest way to turn a file into a clear, animated story.",
      },
    ],
    faq: [
      { q: "Can Clunoid read my PDF, CSV or Excel file?", a: "Yes. Upload a PDF, CSV, Excel (.xlsx) or spreadsheet and Clunoid extracts the data and builds an animated bar-chart-race video from it." },
      { q: "How do I turn a spreadsheet into a video?", a: "Open Stat Battles and upload your file. Clunoid finds the ranking and timeline in your data and builds the animated race automatically, which you can then export as a video." },
      { q: "How do I turn a PDF into a video?", a: "Upload the PDF in Clunoid. It reads the numbers, builds a bar-chart-race Stat Battle from them, and lets you export it as a narrated video to share." },
      { q: "Is my data private and safe?", a: "Your files are tied to your own account and are used only to build your video — they aren't sold, shared, or made public. Only the video you choose to export is yours to post." },
      { q: "What file types work best?", a: "PDFs, CSVs, Excel/.xlsx and common documents and spreadsheets work best — anything that contains a ranking or values over time." },
      { q: "Is it free?", a: "You can start for free. Credits and paid plans cover heavier usage and premium narration." },
    ],
    ctaTitle: "Turn a file into a video",
    ctaSub: "Upload a PDF, Excel or CSV and watch your data move — free to start.",
  },

  // ── Resource: Clunoid vs ChatGPT ─────────────────────────────────────────
  "clunoid-vs-chatgpt": {
    slug: "clunoid-vs-chatgpt",
    nav: "Clunoid vs ChatGPT",
    category: "resource",
    metaTitle: "Clunoid vs ChatGPT — A ChatGPT Alternative That Talks",
    metaDescription:
      "How Clunoid compares to ChatGPT: Isaac answers out loud with synced animated visuals, you talk by voice, and Clunoid builds bar-chart-race videos and hosts a flag game. A visual, talking AI alternative.",
    keywords: [
      "Clunoid vs ChatGPT", "ChatGPT alternative", "ChatGPT alternative with visuals", "AI like ChatGPT but talks",
      "talking AI vs ChatGPT", "visual AI assistant", "AI that answers out loud", "voice AI vs ChatGPT", "best ChatGPT alternative",
      "AI that shows you anything", "conversational AI with visuals", "free ChatGPT alternative", "AI assistant comparison",
    ],
    accent: "clay",
    eyebrow: "Comparison",
    h1: "Clunoid vs ChatGPT — a ChatGPT alternative that talks and shows.",
    heroSub:
      "Both answer your questions. The difference: Isaac answers out loud with synced animated visuals, you can talk to him by voice, and Clunoid also builds bar-chart-race videos and hosts a flag game — not just text in a box.",
    sections: [
      {
        heading: "Answers you watch and hear",
        body: "ChatGPT replies in text. Isaac speaks his answer aloud while synced animated media and an at-a-glance info card appear on screen, so you grasp it faster. It's a visual, talking AI — a different experience from reading a chat transcript.",
      },
      {
        heading: "More than a chatbot",
        body: "Beyond answering questions, Clunoid turns topics or your own files into animated bar-chart-race videos, hosts the Guess the Country flag game out loud, and exports shareable recap videos with AI captions. It's an AI host, not only a text assistant.",
      },
      {
        heading: "Talk to it, hands-free",
        body: "Ask by voice and Isaac listens, researches and replies aloud — a natural back-and-forth. Prefer typing? You can. Either way, answers are grounded in live web sources so they reflect current facts.",
      },
    ],
    comparison: {
      otherName: "Typical text chatbot",
      rows: [
        { label: "Answers out loud (voice)", clunoid: "Yes — spoken by Isaac", other: "Text only by default" },
        { label: "Synced animated visuals", clunoid: "Yes, with an info card", other: "No" },
        { label: "Talk to it by voice", clunoid: "Yes, hands-free", other: "Limited" },
        { label: "Bar-chart-race videos", clunoid: "Built for you, narrated", other: "No" },
        { label: "Flag quiz game", clunoid: "Guess the Country, hosted", other: "No" },
        { label: "Export shareable videos", clunoid: "Free HD, captions & hashtags", other: "No" },
        { label: "Price", clunoid: "Free to start", other: "Varies" },
      ],
    },
    faq: [
      { q: "Is Clunoid a ChatGPT alternative?", a: "Yes. Clunoid answers questions like a chat AI, but Isaac speaks the answer aloud with synced animated visuals, you can talk to him by voice, and Clunoid also builds videos and hosts a game — so it's a more visual, hands-free alternative." },
      { q: "What does Clunoid do that ChatGPT doesn't?", a: "Spoken answers with synced animated visuals, hands-free voice conversation, animated bar-chart-race videos from topics or your files, a voice-hosted flag game, and one-tap shareable recap videos with AI captions." },
      { q: "Is Clunoid free?", a: "Yes — you can start for free. Paid plans and pay-as-you-go credits unlock more usage and Isaac's premium voice." },
      { q: "Is Clunoid as accurate as a chatbot?", a: "Isaac grounds answers in live web research before replying, so answers reflect current facts and ongoing events rather than a fixed snapshot." },
    ],
    ctaTitle: "Try the talking, visual AI",
    ctaSub: "Ask Isaac your first question free.",
  },

  // ── Resource: How to make a bar chart race ───────────────────────────────
  "how-to-make-a-bar-chart-race": {
    slug: "how-to-make-a-bar-chart-race",
    nav: "How to: bar chart race",
    category: "resource",
    metaTitle: "How to Make a Bar Chart Race (Free, No Code)",
    metaDescription:
      "Make a bar chart race in minutes — free, no code. Type a ranking or upload a PDF, CSV or Excel file, and Clunoid builds and narrates an animated bar-chart-race video you can share.",
    keywords: [
      "how to make a bar chart race", "how to make a racing bar chart", "make a bar chart race online", "bar chart race tutorial",
      "create a bar chart race free", "bar chart race no code", "bar chart race from a spreadsheet", "how to animate a bar chart",
      "racing bar chart maker", "bar chart race step by step", "make a bar chart race from CSV", "make a bar chart race from Excel",
    ],
    accent: "spark",
    eyebrow: "Step-by-step guide",
    h1: "How to make a bar chart race — free, in minutes.",
    heroSub:
      "You don't need spreadsheets, animation software or any code. Describe the ranking you want or upload your own data, and Clunoid builds and narrates the bar-chart-race video for you. Here's how.",
    sections: [
      {
        heading: "What you'll need",
        body: "Just a topic (like \"largest economies since 1960\") or a data file — a PDF, CSV, Excel or spreadsheet that holds a ranking or values over time. Clunoid handles the data, the animation and the narration.",
      },
    ],
    stepsHeading: "Make a bar chart race in 4 steps",
    steps: [
      { name: "Open Stat Battles", text: "Sign in to Clunoid and open Stat Battles, the bar-chart-race maker." },
      { name: "Describe it or upload a file", text: "Type the ranking you want — for example \"most-subscribed YouTube channels\" — or upload a PDF, CSV or Excel file with your own data." },
      { name: "Let Clunoid build and narrate it", text: "Clunoid finds the data, builds the animated race, and Isaac narrates the story behind the numbers in your chosen voice." },
      { name: "Export and share", text: "Export a vertical (9:16) or wide (16:9) recap video with an AI-written title, captions and hashtags, then post it to TikTok, Reels, Shorts or X. HD export is free." },
    ],
    faq: [
      { q: "Do I need any software or coding to make a bar chart race?", a: "No. Clunoid builds the bar chart race from your prompt or file automatically — there's no chart software, no spreadsheet formulas and no code." },
      { q: "Can I make a bar chart race from my own data?", a: "Yes. Upload a PDF, CSV, Excel or spreadsheet and Clunoid turns it into an animated race you can export and share." },
      { q: "Is it free to make a bar chart race?", a: "You can start for free and HD export is free. Credits and paid plans cover heavier usage and premium AI narration." },
      { q: "How long does it take?", a: "Usually a couple of minutes — you describe the ranking or upload a file, Clunoid builds and narrates it, and you export the video." },
    ],
    ctaTitle: "Make your bar chart race",
    ctaSub: "Describe a ranking or upload a file — free to start.",
  },

  // ── Resource: AI tools for teachers ──────────────────────────────────────
  "ai-tools-for-teachers": {
    slug: "ai-tools-for-teachers",
    nav: "For Teachers",
    category: "resource",
    metaTitle: "AI Tools for Teachers & Classrooms — Clunoid",
    metaDescription:
      "Clunoid for the classroom: explain any topic with Isaac's visual answers, build animated data videos with Stat Battles, and play Guess the Country to teach geography. Free to start, runs in the browser.",
    keywords: [
      "AI tools for teachers", "AI for the classroom", "AI tools for education", "classroom AI", "AI for students",
      "geography game for the classroom", "teach geography with flags", "data literacy tool", "explain topics with AI",
      "AI teaching tool", "free AI for teachers", "AI for lessons", "interactive learning AI", "flag quiz for students",
    ],
    accent: "clay",
    eyebrow: "For educators",
    h1: "AI tools for teachers and classrooms.",
    heroSub:
      "Clunoid helps you explain, visualize and engage. Use Isaac to answer questions with visuals, build animated data videos with Stat Battles, and play Guess the Country to make geography stick — all in the browser, free to start.",
    sections: [
      {
        heading: "Explain anything, visually",
        body: "Ask Isaac any topic and he answers out loud with synced animated visuals and an info card — a clear, engaging way to introduce a concept or answer a student's question on the spot.",
      },
      {
        heading: "Teach data literacy with Stat Battles",
        body: "Turn historical rankings — populations, economies, Olympic medals — or a classroom dataset into an animated bar-chart-race video. It's data storytelling that holds attention and shows how trends change over time.",
      },
      {
        heading: "Make geography stick with a game",
        body: "Guess the Country is a voice-hosted flag quiz you can tailor to any region or difficulty. Students answer by speaking or typing, and because each quiz is generated fresh it's endlessly replayable for warm-ups and review.",
      },
    ],
    faq: [
      { q: "Is Clunoid good for teachers and classrooms?", a: "Yes. Teachers use Isaac to explain topics with visuals, Stat Battles to teach data literacy with animated charts, and Guess the Country to make geography engaging. It runs in any browser with nothing to install." },
      { q: "Is there a free version for education?", a: "You can start for free — ask questions, play the flag game and export HD videos. Paid plans and credits add more usage." },
      { q: "Do students need to install anything?", a: "No. Clunoid runs in any modern browser on desktop and mobile." },
      { q: "Can I use it to teach geography?", a: "Yes — Guess the Country is a voice-hosted flag quiz you can tailor by region and difficulty, ideal for geography lessons, warm-ups and review." },
    ],
    ctaTitle: "Bring Clunoid to your classroom",
    ctaSub: "Explain, visualize and play — free to start.",
  },
} satisfies Record<string, MarketingPage>;

export type PageKey = keyof typeof PAGES;

/** Feature pages — shown in the homepage grid and the main nav. */
export const FEATURE_ORDER: PageKey[] = [
  "features",
  "isaac",
  "stat-battles",
  "guess-the-country",
  "recap-videos",
  "ai-voices",
  "file-analyzer",
];

/** Resource / SEO pages — shown in the footer "Learn" column. */
export const RESOURCE_ORDER: PageKey[] = [
  "clunoid-vs-chatgpt",
  "how-to-make-a-bar-chart-race",
  "ai-tools-for-teachers",
];

export const FEATURE_PAGES: MarketingPage[] = FEATURE_ORDER.map((k) => PAGES[k]);
export const RESOURCE_PAGES: MarketingPage[] = RESOURCE_ORDER.map((k) => PAGES[k]);
export const ALL_PAGES: MarketingPage[] = [...FEATURE_PAGES, ...RESOURCE_PAGES];
