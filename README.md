# theme-space-language-encoder

Encodes a sentence into a language-agnostic "theme space": a JSON
representation of the predicate (mapped to a universal inventory of
actions/events), its tense/aspect/mood, and its referents linked to
thematic roles (agent, theme, source, goal, recipient, experiencer, ...).

## Usage

```
./encode -en "I sleep"
./encode -en "I steal gold from you"
./encode -en "I run to the store"
```

The `-<code>` flag selects a language data file from `data/languages/<code>.json`.
Currently only `en` (English) is implemented, covering the full Swadesh
207-word list (adapted to fit the grammar the parser supports — see below)
plus a handful of extra common nouns (animals, foods, tools) for good
measure: 526 lexicon entries, 59 verbs/actions in all.

## Architecture

- `encode` — CLI entry point (argument parsing only).
- `src/core/` — the language-agnostic engine. No English (or any other
  language) is hardcoded here; every piece of linguistic knowledge is read
  out of a language data file.
  - `tokenizer.js` — splits raw text into words.
  - `lexer.js` — looks each word up in the language's lexicon.
  - `verbGroup.js` — resolves a run of auxiliary + negation + main verb
    tokens into tense/aspect/mood/polarity, based on generic auxiliary
    lemmas (`be`/`have`/`will`/`do`) rather than English-specific spelling.
  - `chunker.js` — a generic phrase grammar (`NP := DET? NUM? ADJ* (N|PRON)`,
    `PP := ADP NP`) that groups tokens into noun phrases and adposition
    phrases. Determiners cover definite/indefinite articles, demonstratives
    (with a proximal/distal `distance`), and quantifiers (`all`/`many`/
    `some`/`few`/`other`); `NUM` covers cardinal numbers 1-5, which set an
    explicit `quantity` on the referent.
  - `mapper.js` — the semantic core. Resolves verb polysemy (e.g. English
    "run" is either `RUN_MOTION` or `RUN_EXERCISE` depending on whether a
    goal is present), links subject/object/oblique phrases to thematic
    roles using the verb's per-sense `linking` data, and fills in covert
    arguments (a conventionalized default like "eat" implying food, vs. an
    imperative's understood addressee, vs. a role that's simply omitted).
- `data/actions.json` — the universal, language-agnostic inventory of
  actions and their thematic roles. This is the shared "theme space"
  vocabulary that every language's verbs map onto.
- `data/languages/en.json` — pure data (no code): lexicon, pronoun/
  determiner/adposition tables, and the verb-to-action linking rules for
  English. Adding a new language means adding a new file here, not touching
  any code in `src/`.

## Notable quirks this handles

- **Covert arguments**: "I eat" still encodes a `theme` role, just as a
  `COVERT` referent with an implied concept (`FOOD`) — English "eat" isn't
  truly intransitive, its object is just unpronounced. Compare "I steal
  gold", where the unmentioned `source` role is left out of the referents
  entirely, since there's no conventional default for who it was stolen
  from.
- **Object-alternating near-synonyms**: "steal" and "rob" both map to the
  same `STEAL` action, but "steal"'s direct object links to `theme` while
  "rob"'s links to `source` — "I rob you" vs "I steal from you" both leave
  out the referent that isn't syntactically expressed.
- **Verb polysemy**: "run" maps to `RUN_MOTION` when a goal/source is
  present ("run to the store") and falls back to `RUN_EXERCISE` otherwise
  ("I run").
- **Adposition polysemy**: English "to" resolves to `goal` for motion verbs
  but `recipient` for transfer verbs ("give gold to you"), disambiguated by
  which role the governing action actually defines. Likewise "with"
  resolves to `instrument` ("cut with a knife") or `comitative` ("fight
  with the wolf"), and "at" resolves to `location` or `target` ("laugh at
  you"), by the same mechanism.
- **Non-agentive subjects**: unaccusative verbs like `die`, `fall`, `float`,
  `flow`, `freeze`, and `swell` link their subject to a `theme` role rather
  than `agent`, since dying/falling/freezing aren't volitional acts — the
  subject undergoes the event rather than performing it.
- **Negation**: "I do not sleep" sets `polarity: "negative"` in
  `relationToWorld` (default is `"affirmative"`), via generic do-support
  auxiliary handling — no English-specific negation logic in `src/`.

## Swadesh-207 coverage and its limits

`data/languages/en.json`'s lexicon implements the full Swadesh 207-word
list, except for eight items with no grammatical slot in the current
parser: the interrogatives `who`/`what`/`where`/`when`/`how` (no
question-formation grammar — no wh-fronting or subject-aux inversion) and
the conjunctions `and`/`if`/`because` (no multi-clause/subordination
grammar). Adding lexicon entries for these without the grammar to back
them up would let them parse silently as no-ops, which seemed worse than
leaving them out and documenting why. Everything else — all 55 verbs, all
nouns/adjectives/pronouns/demonstratives/quantifiers/numerals — is wired
all the way through to referents in the output.

## Not implemented (yet)

A decoder (theme space → sentence in a target language) is planned but out
of scope for now. The theme space is designed to carry more information
than any single language surfaces (e.g. explicit definiteness/count on
every referent) so that a decoder can drop what it doesn't need; where a
target language needs information the source didn't overtly mark (e.g.
grammatical gender on a noun), that's a follow-up problem for the decoder
side, not something the encoder can invent.
