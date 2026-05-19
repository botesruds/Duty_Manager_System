-- Add lunch_a and lunch_b to the duty_type enum. Per Postgres rule, newly-added
-- enum values can't be used in the same transaction they were added — so this
-- migration is intentionally limited to just the ALTER TYPE statements.
-- The follow-up migration 20260519000008 uses these values.

alter type public.duty_type add value if not exists 'lunch_a';
alter type public.duty_type add value if not exists 'lunch_b';
