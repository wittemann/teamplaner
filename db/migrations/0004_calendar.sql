-- Calendar subscription (iCal): a second secret per family, derived from the personal link.
-- Set when the family opens its page; a new personal link gives a new calendar link.
ALTER TABLE guardian ADD COLUMN calendar_token_hash text UNIQUE;
