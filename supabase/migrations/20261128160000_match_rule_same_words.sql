-- The judge's same_words rule: the same meaningful words as the response, in any order or
-- form ("cave exploration" for Exploring Caves). lenient-judging, GH-339.
alter type public.match_rule add value if not exists 'same_words' after 'sounds_alike';
