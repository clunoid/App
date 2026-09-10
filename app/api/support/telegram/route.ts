import { NextRequest, NextResponse } from "next/server";
import { visitorForTelegramMessage, recordReply, listPeople } from "@/lib/support/threads";
import { isBanned, banPerson, unbanPerson, listBans, clearBans, findBan } from "@/lib/support/bans";
import {
  requestForTelegramMessage, requestForVisitor, pendingRequests, approveRequest, declineRequest,
  markAnswered, PARTNER_ID,
  DERIV_PROFILE, EXAMPLE_CLIENT_ID, DERIV_SIGNUP, declineCount,
  type EaRequest,
} from "@/lib/deriv/mt5/eaAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SUPPORT — the bot, and the way back to the person who asked.
 *
 * Support messages arrive in Telegram. To answer one, swipe-reply to it: the
 * reply is delivered to that visitor in the support bubble on the site, usually
 * within seconds. Telegram tells us which message was replied to, and that id
 * is what identifies the visitor — so the swipe is not a nicety, it is the
 * addressing. A message typed into the chat without replying to anything has no
 * recipient, and the bot says so rather than swallowing it.
 *
 * Telegram will POST to this from the open internet, so the shared secret it
 * was registered with is checked on every call. Without that anyone who guesses
 * the path can make the bot say things.
 *
 * Two replies mean something more than "send this on". Swipe-reply /approve to
 * a request for the General MT5 EA and it mints that person a code and posts it
 * into their support window; /decline tells them no, with the reason typed
 * after it. Both are addressed the same way as any other answer — by the
 * message they reply to — so there is nothing new to remember.
 */

const API = "https://api.telegram.org";

async function say(chatId: number, text: string, replyTo?: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(replyTo ? { reply_to_message_id: replyTo, allow_sending_without_reply: true } : {}),
    }),
    cache: "no-store",
  }).catch(() => { /* nothing useful to do about it here */ });
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    // 200, not 401: a wrong caller should learn nothing, and Telegram must not
    // start retrying a delivery that was never ours.
    return NextResponse.json({ ok: true });
  }

  const update = (await req.json().catch(() => ({}))) as {
    message?: {
      chat?: { id?: number };
      text?: string;
      message_id?: number;
      reply_to_message?: { message_id?: number };
    };
  };

  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (typeof chatId !== "number") return NextResponse.json({ ok: true });

  // Only the owner's chat is listened to. A stranger who finds the bot is not
  // someone we want putting words in front of our visitors.
  if (String(chatId) !== process.env.TELEGRAM_CHAT_ID) return NextResponse.json({ ok: true });

  const repliedTo = msg?.reply_to_message?.message_id;

  // ── a decision on an EA access request ──
  //
  // Reached three ways, because Telegram offers three and the owner should not
  // have to know which one this expects:
  //
  //   . swipe-reply /approve   - points straight at the request
  //   . type or TAP /approve   - tapping a command in a message sends it as
  //                              its OWN message with no reply attached, so
  //                              nothing pointed at the request and it fell
  //                              through to "Nothing was sent". That was a
  //                              reply mechanism refusing a perfectly
  //                              reasonable way of answering.
  //   . /approve 12345678      - names the ID, for when several are waiting
  //
  // Without a reply the outstanding requests are looked up. One waiting needs
  // no disambiguation and is the ordinary case; with several it asks rather
  // than guessing, because approving the wrong person cannot be taken back.
  const cmd = /^\/(approve|decline)(?:@[A-Za-z0-9_]+)?\b/i.exec(text);
  if (cmd) {
    const isApprove = /^approve$/i.test(cmd[1]);
    let reason = text.slice(cmd[0].length).trim();
    let reqst: EaRequest | null = null;

    if (repliedTo) {
      /* Pointed at something: use exactly that. Falling back to "the newest
         pending one" here would approve a DIFFERENT person from the one whose
         message was replied to. */
      reqst = await requestForTelegramMessage(repliedTo);

      /* The message you reply to is usually NOT the request message. A
         conversation runs on: they ask something, you answer, they write
         again, and later you reply to whatever is in front of you rather than
         scrolling back to find the form. That pointer led nowhere and the
         command failed, claiming nothing had ever been recorded.

         So if the message is not itself a request, ask who it belongs to and
         take THEIR request. Same person either way — only the message
         differs, and which message you had on screen should decide nothing. */
      if (!reqst) {
        const who = await visitorForTelegramMessage(repliedTo);
        if (who) reqst = await requestForVisitor(who.visitorId);
      }
    } else {
      /* Any ID, not just digits. This matched 4-12 digits only, while the
         prompt above it offers whatever the person typed — a UUID, or the
         placeholder text — so the command it told you to send bounced. */
      const named = reason.match(/^(\S{4,64})\b/);
      const waiting = await pendingRequests(20);

      if (named) {
        reqst = waiting.find((w) => w.mt5Login === named[1]) ?? null;
        if (!reqst) {
          await say(chatId, `Nothing is waiting for a decision with ID <code>${named[1]}</code>.`, msg?.message_id);
          return NextResponse.json({ ok: true });
        }
        reason = reason.slice(named[0].length).trim();
      } else if (waiting.length === 1) {
        reqst = waiting[0];
      } else if (waiting.length > 1) {
        await say(
          chatId,
          [
            `${waiting.length} requests are waiting. Say which one:`,
            "",
            ...waiting.slice(0, 8).map((w) => `- <code>${w.mt5Login}</code> \u2014 ${w.name} (${w.email})`),
            "",
            `Send <code>/${isApprove ? "approve" : "decline"} ${waiting[0].mt5Login}</code>, or swipe-reply to the one you mean.`,
          ].join("\n"),
          msg?.message_id,
        );
        return NextResponse.json({ ok: true });
      } else {
        await say(chatId, "Nothing is waiting for a decision right now.", msg?.message_id);
        return NextResponse.json({ ok: true });
      }
    }

    if (!reqst) {
      /* Two very different situations, and telling them apart is the whole
         value of this branch.
    
         If the message IS a support message but has no EA request behind it,
         the request was never recorded — which happens when the ea_requests
         table is missing. Saying "that is not a request" there sends somebody
         hunting for a mistake they did not make, which is exactly what it did.
         The person is still reachable, so that is said too. */
      const who = repliedTo ? await visitorForTelegramMessage(repliedTo) : null;
      await say(
        chatId,
        who
          ? [
              `${who.email || "This person"} has never sent the EA form, so there is no request to ${isApprove ? "approve" : "decline"}.`,
              "",
              "Ask them to open the bot’s page and fill it in — then the request lands here and this command works.",
              "",
              "They are reachable meanwhile: anything you type here WITHOUT a slash goes to them as a normal reply.",
            ].join("\n")
          : "That is not an EA access request, so there is nothing to approve. Swipe-reply to the request itself, or to anything that person sent.",
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    /* A DECISION IS ABOUT THE PERSON, so it settles everything of theirs.
     *
     * One person often has several rows: the form has no memory, so returning
     * to the page and filling it in again makes another. Deciding used to touch
     * only the row you happened to resolve, and the duplicates stayed pending —
     * which is why people you had already answered kept reappearing in "3
     * requests are waiting", each one an individual asking for a decision that
     * had in fact been made.
     *
     * Marked answered rather than decided: the row you acted on carries the
     * real outcome, and the others were never separately judged. */
    const alsoSettled = await markAnswered(reqst.visitorId);

    if (isApprove) {
      const code = await approveRequest(reqst.id);
      if (!code) {
        await say(chatId, "⚠️ Could not issue a code just now. Nothing was sent — try again in a moment.", msg?.message_id);
        return NextResponse.json({ ok: true });
      }

      const delivered = await recordReply(
        reqst.visitorId,
        [
          `Your ID ${reqst.mt5Login} is confirmed under our community — here is your download code:`,
          "",
          code,
          "",
          "Paste it into step 4 on the bot's page to unlock the download. It works only on this browser.",
        ].join("\n"),
      );

      await say(
        chatId,
        delivered
          ? `✅ Approved. Code <code>${code}</code> sent to ${reqst.name} (${reqst.email}), ID <code>${reqst.mt5Login}</code>.${alsoSettled > 1 ? ` Their ${alsoSettled - 1} other open request${alsoSettled === 2 ? "" : "s"} left the waiting list with it.` : ""}`
          : `⚠️ Code <code>${code}</code> was issued but could not be delivered. Send it to ${reqst.email} yourself.`,
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    await declineRequest(reqst.id);

    /* A REPEAT decline is not the first one said again.
     *
     * Somebody who checked their ID, wrote to Deriv and came back to the same
     * three paragraphs cannot tell whether anything happened at all — it reads
     * like an autoreply, and it is the point at which people give up. The count
     * includes the decision just made, so >1 means they have been here before.
     *
     * The first-time version is two messages because it carries two different
     * UUIDs — theirs to check, ours to quote — and in one bubble they read as
     * the same kind of thing, which is how somebody ends up giving Deriv the
     * wrong one. The repeat is a single short message: they already know to
     * check, so it just restates what is still missing and what to send. */
    const times = await declineCount(reqst.visitorId);

    const ASK = "\"Deriv support requires a full referral URL (from domains like track.deriv.com or t.deriv.link) instead of just the partner ID to link my MT5 account. Please provide the correct partner referral link.\"";

    const first = times > 1
      ? await recordReply(
          reqst.visitorId,
          [
            `We checked again and ${reqst.mt5Login} is still not showing under our team.`,
            reason,
            "",
            "Deriv has to add it — we cannot do it from our side. Send them both of these:",
            "",
            `Partner ID: ${PARTNER_ID}`,
            `Referral link: ${DERIV_SIGNUP}`,
            "",
            `They usually ask for the link rather than the ID, so it helps to say: ${ASK}`,
            "",
            "Reply here once they confirm and we will check again.",
          ].filter((line, i) => i !== 1 || line !== "").join("\n"),
        )
      : await recordReply(
          reqst.visitorId,
          [
            `We could not find ID ${reqst.mt5Login} under our community, so we cannot send a code for it yet.`,
            reason,
            "",
            "First, check you sent the right one. Your own client ID is on your Deriv profile — open it, copy the ID shown there, and reply here with it:",
            DERIV_PROFILE,
            "",
            `(It looks like ${EXAMPLE_CLIENT_ID})`,
          ]
            /* Only a missing reason is dropped; the blank lines are the
               paragraph breaks, and filtering those out ran it all together. */
            .filter((line, i) => i !== 1 || line !== "")
            .join("\n"),
        );

    /* The repeat says everything in one message, so there is no second one. */
    const second = times > 1
      ? true
      : await recordReply(
          reqst.visitorId,
          [
            "If that ID was already the right one, then your account is not under us yet — and only Deriv can move it.",
            "",
            "Ask Deriv support to place your account under this partner ID:",
            PARTNER_ID,
            "",
            "That is OUR partner ID, not yours — give them that one.",
            "",
            `Deriv usually want the referral link rather than the ID, so send them this too: ${DERIV_SIGNUP}`,
            "",
            `If they ask for it, say: ${ASK}`,
            "",
            "Reply here once they confirm and we will check again.",
          ].join("\n"),
        );

    const delivered = first && second;
    await say(
      chatId,
      delivered
        ? `Declined. ${reqst.name} (${reqst.email}) has been told, with the partner ID and referral link.${alsoSettled > 1 ? ` Their ${alsoSettled - 1} other open request${alsoSettled === 2 ? "" : "s"} left the waiting list with it.` : ""}${times > 1 ? ` This is decline #${times} for them — they got the follow-up wording, not the first one again.` : ""}`
        : `Declined, but the message could not be delivered — tell ${reqst.email} yourself.`,
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
  }

  // ── a reply to a support message: deliver it ──
  if (repliedTo && text && !text.startsWith("/")) {
    const who = await visitorForTelegramMessage(repliedTo);

    if (!who) {
      await say(chatId, "That is not a support message, so there is nobody to send it to. Swipe-reply to the message from the person you want to answer.", msg?.message_id);
      return NextResponse.json({ ok: true });
    }

    const stored = await recordReply(who.visitorId, text);

    /* Answering somebody IS dealing with them.
     *
     * Their EA request stayed `pending` until a slash command touched it, so
     * people who had been written to kept coming back in the "3 requests are
     * waiting" list — and the list only grew, because most conversations are
     * handled by talking rather than by deciding. A reply now takes their open
     * requests out of the queue. It decides nothing: /approve and /decline
     * still work on them afterwards, from any message in the thread. */
    const cleared = stored ? await markAnswered(who.visitorId) : 0;

    await say(
      chatId,
      stored
        ? [
            `✅ Delivered to <code>${who.visitorId}</code>. They will see it in the support window on the site${who.email ? ` — ${who.email}` : ""}.`,
            cleared
              ? `Their EA request is off the waiting list — you have answered them. <code>/approve</code> or <code>/decline</code> still work on it from any message of theirs.`
              : "",
          ].filter(Boolean).join("\n")
        : "⚠️ Could not deliver that just now. Nothing was sent — try again in a moment.",
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
  }

  // ── the door: /ban, /unban, /bans ──
  //
  // Addressed the same way a decision is: swipe-reply to somebody's message to
  // act on THEM, or name an email. A swipe-reply is the safer of the two and
  // the one to prefer, because it cannot land on the wrong person.
  const doorCmd = /^\/(ban|unban)(?:@[A-Za-z0-9_]+)?\b/i.exec(text);
  if (doorCmd) {
    const banning = /^ban$/i.test(doorCmd[1]);
    const rest = text.slice(doorCmd[0].length).trim();

    let visitorId: string | null = null;
    let email: string | null = null;
    let name: string | null = null;
    let reason = rest;

    if (repliedTo) {
      const who = await visitorForTelegramMessage(repliedTo);
      if (!who) {
        await say(chatId, "That is not a support message, so there is nobody to act on. Swipe-reply to a message from the person you mean, or send <code>/BANCMD their@email</code>.".replace("BANCMD", banning ? "ban" : "unban"), msg?.message_id);
        return NextResponse.json({ ok: true });
      }
      visitorId = who.visitorId;
      email = who.email;
    } else {
      const named = rest.match(/^(\S+@\S+\.\S+|[A-Za-z0-9-]{6,})\b/);
      if (!named) {
        await say(chatId, `Say who. Swipe-reply to their message, or send <code>/${banning ? "ban" : "unban"} their@email</code>.`, msg?.message_id);
        return NextResponse.json({ ok: true });
      }
      if (named[1].includes("@")) email = named[1];
      else visitorId = named[1];
      reason = rest.slice(named[0].length).trim();
    }

    if (banning) {
      const done = await banPerson({ visitorId, email, name, reason: reason || null });
      /* Somebody shown the door is not somebody you still owe a decision. */
      if (done?.visitorId) await markAnswered(done.visitorId);
      await say(
        chatId,
        done
          ? [
              `Banned ${done.email || done.visitorId}.`,
              done.reason ? `Reason: ${done.reason}` : "",
              "",
              "Their messages and EA requests stop reaching you. Nothing tells them so — the window just goes quiet.",
              "Undo with <code>/unban " + (done.email || done.visitorId) + "</code>.",
            ].filter(Boolean).join("\n")
          : "Could not record that ban.",
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    const key = email || visitorId || "";
    const lifted = await unbanPerson(key);
    await say(
      chatId,
      lifted
        ? `Unbanned ${lifted.email || lifted.visitorId}. They can write in again. The row stays in <code>/bans</code> so the history is not lost.`
        : `No active ban found for <code>${key}</code>.`,
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
  }

  // ── the list, and emptying it ──
  if (/^\/bans\b/i.test(text)) {
    const arg = text.replace(/^\/bans(?:@[A-Za-z0-9_]+)?/i, "").trim().toLowerCase();

    if (arg === "clear" || arg === "clear lifted" || arg === "clear all") {
      const which = arg === "clear all" ? "all" : "lifted";
      const gone = await clearBans(which as "lifted" | "all");
      await say(
        chatId,
        which === "all"
          ? `Cleared the whole list — ${gone} row${gone === 1 ? "" : "s"} deleted. Everyone who was banned is unbanned.`
          : `Cleared ${gone} lifted ban${gone === 1 ? "" : "s"}. Active bans are untouched — <code>/bans clear all</code> removes those too.`,
        msg?.message_id,
      );
      return NextResponse.json({ ok: true });
    }

    const rows = await listBans(40);
    if (!rows.length) {
      await say(chatId, "Nobody is banned, and nobody has been.", msg?.message_id);
      return NextResponse.json({ ok: true });
    }

    const live = rows.filter((r) => r.active);
    await say(
      chatId,
      [
        `<b>Bans</b> — ${live.length} active of ${rows.length}`,
        "",
        ...rows.slice(0, 25).map((r) => {
          const who = r.email || r.visitorId || "?";
          const day = r.bannedAt.slice(0, 10);
          return r.active
            ? `⛔ <code>${who}</code> — ${day}${r.reason ? ` — ${r.reason}` : ""}`
            : `✓ <code>${who}</code> — banned ${day}, lifted ${(r.unbannedAt || "").slice(0, 10)}`;
        }),
        rows.length > 25 ? `
…and ${rows.length - 25} more.` : "",
        "",
        "<code>/bans clear</code> removes the lifted ones, <code>/bans clear all</code> empties it entirely.",
      ].filter(Boolean).join("\n"),
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
  }

  // ── who has written in ──
  if (/^\/users\b/i.test(text)) {
    const people = await listPeople(40);
    if (!people.length) {
      await say(chatId, "Nobody has written in yet.", msg?.message_id);
      return NextResponse.json({ ok: true });
    }

    /* Banned people are marked rather than hidden: a list that quietly omits
       them makes you wonder where somebody went. */
    const marks = await Promise.all(people.map((u) => isBanned(u.visitorId, u.email)));

    await say(
      chatId,
      [
        `<b>People</b> — ${people.length}`,
        "",
        ...people.slice(0, 30).map((u, i) => {
          const when = u.last.slice(0, 10);
          const since = u.first.slice(0, 10);
          const span = since === when ? when : `${since} → ${when}`;
          return [
            `${marks[i] ? "⛔ " : ""}<b>${u.name || "(no name)"}</b>`,
            `  ${u.email || "(no email)"}`,
            `  ${span} · ${u.messages} msg${u.messages === 1 ? "" : "s"}`,
          ].join("\n");
        }),
        people.length > 30 ? `
…and ${people.length - 30} more.` : "",
      ].filter(Boolean).join("\n"),
      msg?.message_id,
    );
    return NextResponse.json({ ok: true });
  }

  // ── commands and stray messages ──
  if (/^\/start\b/.test(text)) {
    await say(
      chatId,
      [
        "<b>Clunoid support is connected.</b>",
        "",
        "Messages from the support bubble on clunoid.com arrive here.",
        "",
        "<b>To answer someone, swipe-reply to their message.</b> Your reply appears in their support window on the site within seconds.",
        "",
        "Typing here without replying to a message sends it nowhere — there is no way to tell who it was meant for.",
        "",
        "<b>MT5 EA requests:</b> send <code>/approve</code> to issue a download code, or <code>/decline your reason</code> to turn it down. Tapping the command in the request works, and so does typing it — no reply needed while only one request is waiting. With several waiting, add the ID: <code>/approve 12345678</code>. Anybody already approved is not listed — they hold a code, so there is nothing left to decide.",
        "",
        "<b>Keeping people out:</b> swipe-reply and send <code>/ban</code> (add a reason if you want one recorded), or <code>/ban their@email</code>. Their messages and requests stop reaching you and they are told nothing. <code>/unban</code> lifts it. <code>/bans</code> is the list, <code>/bans clear</code> tidies the lifted ones and <code>/bans clear all</code> empties it.",
        "",
        "<b>Who has written in:</b> <code>/users</code> — names, emails and dates, banned ones marked.",
      ].join("\n"),
    );
  } else if (/^\/(help|status)\b/.test(text)) {
    await say(chatId, "Swipe-reply to a support message to answer it. For an MT5 EA request send /approve or /decline — you only need to name an ID when several are waiting, and people already approved are never listed. /ban and /unban control who gets through, /bans is that list, /users is everyone who has written in. An ordinary message with no reply attached has no recipient.");
  } else {
    await say(chatId, "Nothing was sent — I could not tell who that was for. <b>Swipe-reply</b> to someone's support message to answer them.");
  }

  return NextResponse.json({ ok: true });
}
