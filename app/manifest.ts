import type { MetadataRoute } from "next";

/**
 * THE INSTALL MANIFEST.
 *
 * This is the whole reason clunoid.com can be installed as an app. A service
 * worker is NOT required for installability, and this app deliberately does not
 * add one for it: components/tdesk/push-client.ts already registers a push
 * worker at scope "/trading", and the narrowest matching scope wins — a second
 * worker at "/" would either be shadowed there or start fighting it. Caching a
 * trading screen is also the wrong instinct: a stale balance is worse than a
 * slow one.
 *
 * `start_url` is /trading, not /. Middleware rewrites `/` to the trading
 * landing and redirects every classic page there, so launching the installed
 * app at the real URL saves a redirect on every cold start — and a manifest
 * whose start_url redirects is the usual reason an install "opens the website"
 * instead of the app.
 *
 * `id` is set explicitly and must never change: browsers key an installed app
 * on it, and changing it later turns an update into a second, duplicate app on
 * everybody's home screen.
 *
 * Next serves this at /manifest.webmanifest and injects the <link> itself. The
 * middleware matcher already excludes .webmanifest, so trading mode never
 * rewrites it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/trading",
    name: "Clunoid Trading — free automated trading bots",
    short_name: "Clunoid",
    description:
      "Free automated trading bots for MT5 and Deriv. Run them on your own account, watch them work, and get paid to post about them.",

    start_url: "/trading",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",

    background_color: "#070b12",
    theme_color: "#070b12",

    // Chromium wants a 192 and a 512 before it will offer the install.
    // "any" is used as-is; "maskable" is the one Android crops to its own
    // shape, which is why it is a separate file with the mark inset.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],

    // Long-pressing the installed icon jumps straight to these.
    shortcuts: [
      { name: "Deriv bots", short_name: "Bots", url: "/trading/deriv/bots" },
      { name: "MT5 bots", short_name: "MT5", url: "/trading/mt5" },
      { name: "Get paid to post", short_name: "Creators", url: "/trading/creators" },
    ],

    categories: ["finance", "business", "productivity"],
    lang: "en",
    dir: "ltr",

    // Says plainly that there is no native app we would rather they installed.
    prefer_related_applications: false,
  };
}
