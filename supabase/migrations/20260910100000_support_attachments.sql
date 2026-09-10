-- WHAT WAS ATTACHED — screenshots and documents, in both directions.
--
-- Pictures already went one way: somebody could attach a screenshot in the
-- support window and it arrived in Telegram as a photo, because "it looks
-- wrong" is a sentence a picture answers and a paragraph does not. The way
-- back did not exist. Replying with a screenshot — a marked-up chart, a page
-- with the button circled, the exact error to look for — was silently refused,
-- and the owner was told the message could not be addressed at all.
--
-- The file itself lives in the `support-files` storage bucket; these columns are
-- the pointer, the original name and the type. A row can carry a file with no
-- text at all: a screenshot on its own is a complete answer, and requiring a
-- caption for it would only produce captions like "see image".
--
-- Nothing here is guessed from the URL. The name is what the sender called it,
-- so the person receiving it sees the same filename; the type decides whether
-- it renders as an image or as something to download, and getting that from a
-- file extension is how a .pdf ends up in an <img> tag.

alter table public.trading_support_messages
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text;

comment on column public.trading_support_messages.attachment_url is
  'Public URL in the support-files bucket. Null for an ordinary text message.';
