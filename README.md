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
207-word list (adapted to fit the grammar the parser supports — see below),
a broad set of closed-class vocabulary (possessive determiners, demonstratives,
quantifiers, numerals, prepositions, indefinite/quantificational pronouns),
plus a handful of extra common nouns (animals, foods, tools) for good
measure: 575 lexicon entries, 59 verbs + 4 copular actions (63 actions
total), 26 contractions in all.

## Architecture

- `encode` — CLI entry point (argument parsing only).
- `src/core/` — the language-agnostic engine. No English (or any other
  language) is hardcoded here; every piece of linguistic knowledge is read
  out of a language data file.
  - `tokenizer.js` — splits raw text into words (keeping apostrophes, since
    contraction expansion needs them intact).
  - `contractions.js` — expands contracted words into their full multi-word
    form ("didn't" -> `["did", "not"]`) before lexing, via a per-language
    lookup table (`langData.contractions`) — the rest of the pipeline
    assumes auxiliaries/negation/pronouns are already separate tokens and
    would otherwise choke on (or silently drop) contracted input.
  - `lexer.js` — looks each word up in the language's lexicon, then resolves
    words that are ambiguous between two parts of speech (e.g. English "her":
    determiner in "her dog", pronoun in "I see her"; "that": determiner in
    "that dog", standalone demonstrative pronoun in "that is red") using one
    generic lookahead rule — see "Notable quirks" below.
  - `verbGroup.js` — resolves a run of auxiliary + negation + main verb
    tokens into tense/aspect/mood/polarity, based on generic auxiliary
    lemmas (`be`/`have`/`will`/`do`) rather than English-specific spelling.
    Also resolves bare copular clauses ("is red", with no lexical main verb
    at all) separately, since "be" there is the predicate, not an aspect
    auxiliary.
  - `chunker.js` — a generic phrase grammar (`NP := DET? NUM? ADJ* (N|PRON)`,
    `PP := ADP NP`) that groups tokens into noun phrases and adposition
    phrases. Determiners cover definite/indefinite articles, demonstratives
    (with a proximal/distal `distance`), quantifiers (`all`/`many`/`some`/
    `few`/`other`/`each`/`every`/`any`/`no`/`both`/`either`/`neither`/
    `several`), and possessives (`my`/`your`/`his`/`her`/`its`/`our`/`their`,
    which attach a `possessor` referent to the noun phrase); `NUM` covers
    cardinal numbers 1-5, which set an explicit `quantity` on the referent.
    Also parses copular complements (predicate adjective/nominal/PP), which
    the ordinary NP grammar can't (a bare predicate adjective has no head
    noun at all).
  - `mapper.js` — the semantic core. Resolves verb polysemy (e.g. English
    "run" is either `RUN_MOTION` or `RUN_EXERCISE` depending on whether a
    goal is present), links subject/object/oblique phrases to thematic
    roles using the verb's per-sense `linking` data, and fills in covert
    arguments (a conventionalized default like "eat" implying food, vs. an
    imperative's understood addressee, vs. a role that's simply omitted).
    Also maps copular clauses onto one of four fixed actions (`ATTRIBUTE`/
    `BE_LOCATED`/`CLASSIFY`/`EQUATE`) based on the shape of the complement —
    see "Copular sentences" below.
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
  with the wolf"), "at" resolves to `location` or `target` ("laugh at
  you"), and "around" resolves to `path` on a motion verb ("run around the
  tree") or `location` on a stative one ("sit around the fire") — all by
  the same generic mechanism: try each candidate role the preposition could
  mean, and use whichever one the governing action actually defines.
- **POS ambiguity resolved by lookahead**: English "her" is a possessive
  determiner in "her dog" but a personal pronoun in "I see her" — the exact
  same word form. `lexer.js` resolves this generically (not with an
  English-specific rule): if an adjective or noun follows, the word is
  introducing a noun phrase (determiner reading); otherwise it's standing in
  for one on its own (pronoun reading). `his`/`its`/`your`/`our`/`their`
  don't need this because English happens not to reuse those forms as
  object pronouns, so they're just modeled as plain possessive determiners.
- **Demonstratives are ambiguous too**: same mechanism as "her" — "this"/
  "that"/"these"/"those" are a determiner in "this dog" but a standalone
  pronoun in "this is red" (which has no head noun at all: without this
  resolution, the NP grammar would silently drop the subject entirely and
  the clause would wrongly fall back to an imperative reading).
- **Possessors as referents**: a possessive determiner doesn't just mark a
  noun phrase as definite — "my dog" introduces a second referent (the
  possessor). `relationToWorld.possessor` is nested as a full
  `{ referent, relationToWorld }` object, the same shape as any other
  referent, rather than a flattened feature.
- **Non-agentive subjects**: unaccusative verbs like `die`, `fall`, `float`,
  `flow`, `freeze`, and `swell` link their subject to a `theme` role rather
  than `agent`, since dying/falling/freezing aren't volitional acts — the
  subject undergoes the event rather than performing it.
- **Negation**: "I do not sleep" sets `polarity: "negative"` in
  `relationToWorld` (default is `"affirmative"`), via generic do-support
  auxiliary handling — no English-specific negation logic in `src/`.
- **Contractions**: "I didn't sleep" expands to `did` + `not` before
  parsing. `'s` (ambiguous three ways between "is", "has", and the Saxon
  genitive possessive marker in "the dog's bone") and `'d` (ambiguous
  between "had" and modal "would", which isn't modeled) are deliberately
  left unexpanded rather than guessing — use the uncontracted forms instead.

## Definiteness and genericity

Every nominal referent's `relationToWorld.definiteness` is one of three
values, plus a fourth case where the field is absent entirely:

- `"definite"` — "the cat", "my dog", "this cat", and personal pronouns
  ("me", "you") all pick out a specific, identifiable referent.
- `"indefinite"` — "a cat" asserts existence of some referent without
  identifying it; "someone"/"anyone" work the same way as pronouns.
- `"generic"` — a determiner-less plural or mass noun ("cats", "water")
  doesn't refer to some existing cats or water at all; it names the *kind*
  itself. This is a real, distinct category in formal semantics, not an
  edge case of "indefinite": Carlson (1977), *Reference to Kinds in
  English*, argues bare plurals are essentially proper names for kinds
  ("kind reference"), and Krifka et al. (1995), *Genericity: An
  Introduction*, class bare plural/mass NPs and definite-singular generics
  ("the lion is a mammal") together as **kind-denoting** ("D-generic")
  NPs — as opposed to **characterizing sentences** ("John smokes"), where
  genericity lives in the predicate via a covert `GEN` quantifier
  ("I-genericity"), not in any one NP. This encoder only detects the
  structural D-generic case (bare plural/mass); it doesn't attempt sentence-
  level (I-genericity) classification, which would need to tell stage-level
  predicates ("is on the mat") apart from individual-level ones ("is a
  mammal") to know whether e.g. "a lion is a mammal" should itself count
  as generic. That's a real gap, documented rather than guessed at.
- *(absent)* — quantified NPs ("every dog", "no bread") and quantificational
  pronouns ("everyone", "nobody") get a `quantifier` instead. Quantification
  is a different dimension from referentiality/definiteness, so forcing one
  of the three values onto them would misrepresent what they mean.

## Copular sentences

"Be" clauses don't fit the ordinary verb pipeline at all — there's no
lexical main verb to map onto an action or link roles through, since "be"
itself is the predicate. They're handled by a separate path (`resolveCopula`
in `verbGroup.js`, `chunkCopulaComplement` in `chunker.js`,
`mapCopulaToThemeSpace` in `mapper.js`) that resolves to one of four fixed
actions purely from the shape of the complement:

- **`ATTRIBUTE`** — a bare predicate adjective ("the dog is red"). This is
  truth-conditionally the same content as an attributive adjective ("the
  red dog"), just realized predicatively — so the property is folded into
  the subject's own `modifiers` rather than becoming a referent of its own.
- **`BE_LOCATED`** — a predicate PP ("the book is on the table"). The
  subject is a `theme`, not an `agent`: it isn't doing anything, just
  situated somewhere.
- **`CLASSIFY`** vs. **`EQUATE`** — a predicate noun phrase ("he is a
  doctor" vs. "he is the king"). These look identical (subject + "be" + NP)
  but mean different things: the first ascribes class/kind membership
  (predicational), the second identifies the subject with another specific
  entity (specificational/equative). Higgins (1979), *The Pseudo-Cleft
  Construction in English*, and Declerck (1988), *Studies on Copular
  Sentences, Clefts, and Pseudo-Clefts*, distinguish exactly this split;
  the encoder follows their diagnostic and picks `CLASSIFY` when the
  predicate NP is indefinite/generic ("a doctor") and `EQUATE` when it's
  definite or a pronoun ("the king", "her").

Not handled: predicate adjectives joined with "and" (no coordination
grammar at all, so "is big and red" fails on the unsupported word "and");
"'s"-contracted copulas ("he's sleeping"), since `'s` is left unexpanded
(see "Contractions" above).

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
