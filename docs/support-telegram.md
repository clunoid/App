# Creator support → your Telegram

The support bubble on `/trading/creators` posts to `/api/support`, which forwards
the message to a Telegram chat. Creators are told only that we will reply to
their email — the transport is not their concern.

Two environment variables switch it on. Until both are set the bubble is still
there but sending returns "We could not send that just now", and the server logs
say why.

## 1. Make the bot (2 minutes, in Telegram)

1. Open Telegram and search for **@BotFather**, then press **Start**.
2. Send `/newbot`.
3. Give it a display name — e.g. `Clunoid Support`.
4. Give it a username ending in `bot` — e.g. `clunoid_support_bot`. If it is
   taken, try another.
5. BotFather replies with a line like
   `7123456789:AAF3k2...` — that is `TELEGRAM_BOT_TOKEN`.

Treat that token as a password. Anyone holding it can send as your bot.

## 2. Get your chat id

1. Search for **@userinfobot**, press **Start**.
2. It replies with `Id: 123456789` — that is `TELEGRAM_CHAT_ID`.
3. **Then open your new bot and press Start on it.** This step is the one people
   skip. Telegram will not let a bot message you until you have started a chat
   with it, and without it every send fails with
   `403: bot can't initiate conversation with a user`.

## 3. Set the variables

Locally, in `.env`:

```
TELEGRAM_BOT_TOKEN=7123456789:AAF3k2...
TELEGRAM_CHAT_ID=123456789
```

In production, add the same two in your host's environment settings (Vercel:
Project → Settings → Environment Variables, then redeploy). They must **not** be
prefixed `NEXT_PUBLIC_`.

## 4. Check it works

With the dev server running:

```bash
curl -X POST http://localhost:3000/api/support -H "Content-Type: application/json" -d "{\"email\":\"you@example.com\",\"message\":\"test from curl\"}"
```

`{"ok":true}` and a message on your phone means it is done.

## Replying

The Telegram message starts with **Reply to: <their email>** as a tappable
mailto. Replying happens in your email client, from whatever address you
normally use — the bot is one-way, inbound only.

## Notes

- `/api/support` is public, so it is rate limited per IP: one message every 20
  seconds, 12 an hour. The counters live in memory and reset on deploy.
- Messages are **not** stored in the database. If Telegram is down the creator
  is told to try again rather than the message being silently dropped, but there
  is no archive to go back to.
- To send to a group instead of your DM, add the bot to the group and use the
  group's id (it starts with `-100`) as `TELEGRAM_CHAT_ID`.
