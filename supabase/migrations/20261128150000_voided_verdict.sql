-- An answer given after an earlier answer on the same clue was overridden to correct no
-- longer counts: it scores 0 and is recorded as voided (GH-338). update_verdict already takes
-- any verdict; stats count only the four right/wrong verdicts, so a voided answer is neither.
alter type public.verdict add value if not exists 'voided' after 'overridden_incorrect';
