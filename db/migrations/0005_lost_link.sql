-- "Link verloren?" (docs/features.md): the personal link is also stored encrypted, so it can be
-- mailed again unchanged (key only in the Vercel environment, src/lib/token.ts). Empty for links
-- created before; filled when the link is next opened. link_mailed_at limits the mails.
ALTER TABLE guardian ADD COLUMN access_token_sealed text;
ALTER TABLE guardian ADD COLUMN link_mailed_at timestamptz;
ALTER TABLE coach ADD COLUMN access_token_sealed text;
ALTER TABLE coach ADD COLUMN link_mailed_at timestamptz;
