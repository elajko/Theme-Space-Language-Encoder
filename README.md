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
measure: 577 lexicon entries, 59 verbs + 4 copular actions (63 actions
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

Every nominal referent's `relationToWorld.definiteness` is one of exactly
three values — every determiner in the lexicon resolves to one of these,
with no fourth "in-between" value — or the field is simply absent when
nothing can be confidently said:

- `"definite"` — "the cat" picks out a specific, identifiable referent, and
  so do personal pronouns ("me", "you"). Two categories that might look
  like they deserve their own value turn out, on inspection, to just be
  definite plus some extra detail, carried in a separate field rather than
  invented as a new definiteness value:
  - **Demonstratives** ("this cat", "that cat") are definite determiners —
    "that cat" identifies a specific referent exactly the way "the cat"
    does. Proximity (near vs. far from the speaker) is extra information
    layered on top, not a different kind of definiteness, so it's carried
    separately as `distance` ("proximal"/"distal") alongside
    `definiteness: "definite"`, rather than as a `"demonstrative"` value
    that would've had to sit outside the definite/indefinite/generic system.
  - **Strong quantificational determiners** ("every cat", "all cats", "each
    cat", "both cats", "either cat", "neither cat") are also definite.
    Milsark (1977), "Toward an explanation of certain peculiarities of the
    existential construction in English" (*Linguistic Analysis* 3),
    classifies determiners as **strong** or **weak** by whether they can
    appear in a "there is/are ___" existential: strong determiners can't
    ("*there is every solution", "*there are all interesting solutions",
    "*there are both computers", "*there is neither computer" — Barwise &
    Cooper 1981 formalize this as presupposing a fixed domain rather than
    asserting a cardinality within an open one), and pattern with "the",
    not "a". `quantifier` (`"EVERY"`/`"ALL"`/`"EACH"`/`"BOTH"`/`"EITHER"`/
    `"NEITHER"`) records which one, as extra detail — same pattern as
    `distance` above.
- `"indefinite"` — "a cat" asserts existence of some referent without
  identifying it; so does a bare numeral with no article ("two dogs" — a
  specific *count* of individuals, still not kind reference, see below);
  "someone"/"anyone" work the same way as pronouns. **Weak** quantificational
  determiners belong here too, by the same Milsark/Barwise & Cooper test —
  "there are many/some/several/no/any/other cats" are all fine, patterning
  with "a" rather than "the" — so "many"/"some"/"few"/"several"/"no"/"any"/
  "other" get `definiteness: "indefinite"` plus a `quantifier` recording
  which one.
- `"generic"` — a determiner-less, numeral-less plural or mass noun
  ("cats", "water") doesn't refer to some existing cats or water at all;
  it names the *kind* itself. This is a distinct category in formal
  semantics, not an edge case of "indefinite": Carlson (1977), *Reference
  to Kinds in English*, argues bare plurals are essentially proper names
  for kinds ("kind reference"), and Chierchia (1998), "Reference to Kinds
  across Language" (*Natural Language Semantics* 6), treats kind-denotation
  as one of the fundamental semantic types an NP can have, on a par with
  (not a subtype of) ordinary definite/indefinite reference. Krifka et al.
  (1995), *Genericity: An Introduction*, class bare plural/mass NPs and
  definite-singular generics ("the lion is a mammal") together as
  **kind-denoting** ("D-generic") NPs — note that this means definite and
  generic *aren't* mutually exclusive in general (a definite article can
  mark kind reference too); what Krifka et al. actually rule out is an
  *indefinite singular* achieving true kind reference ("a lion is a
  mammal" has to be reanalyzed as a **characterizing sentence** instead,
  where genericity lives in the predicate via a covert `GEN` quantifier —
  "I-genericity" — rather than in the subject NP). This encoder only
  detects the structural D-generic case (bare plural/mass with no article,
  numeral, or quantifier); it doesn't attempt I-genericity classification
  (which would need to tell stage-level predicates like "is on the mat"
  apart from individual-level ones like "is a mammal"), nor does it detect
  definite singular generics ("the lion is a mammal" is just tagged
  `"definite"`, missing its kind-denoting reading). Both are real gaps,
  documented rather than guessed at.
- *(absent)* — a genuinely rare bare singular count noun with no article,
  numeral, or quantifier at all ("dog sleeps") isn't confidently
  classifiable as any of the three, so nothing is reported rather than
  guessed at. This is now the *only* case the field is missing for — every
  determiner (including quantifiers and demonstratives) resolves to one of
  the three values above.

`count` (singular/plural) is likewise omitted whenever `definiteness` is
`"generic"`. A kind, per Carlson, is a single unified entity — "dogs" in
"dogs bark" doesn't mean *several* dogs bark, any more than "water" in
"water is wet" is one countable unit of water. The plural or mass marking
on a bare generic NP is just the syntactic vehicle English happens to use
to express kind reference, not a semantic claim about cardinality, so
there's no sensible singular-or-plural value to report for it.

One related lexicon-level fix worth knowing about: invariant-plural nouns
("fish", "sheep" — spelled the same for one or many) default to `count:
"plural"` in their single lexicon entry, since a bare, article-less "fish"
is what triggers the generic reading ("cats eat fish"); `"a"/"an"` still
forces `count: "singular"` on them regardless ("a fish" is unambiguously
one), and an explicit numeral overrides the default the normal way ("two
fish").

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

## Questions

Both English question types get `mood: "interrogative"` and their own
parsing path, since neither fits the subject-first declarative grammar:

- **Polar (yes/no) questions** ("Do you sleep?", "Is the dog red?", "Have
  you slept?") front the first auxiliary ahead of the subject. A tensed AUX
  in sentence-initial position is otherwise impossible in this grammar
  (declaratives are always subject-first), so it's an unambiguous trigger —
  `chunkPolarQuestion` in `chunker.js` peels the fronted auxiliary (+ a
  fused leading NEG, for contracted negation like "Isn't the dog red?")
  off, parses exactly one subject NP after it, then sweeps the remainder as
  an ordinary verb group, re-assembling the same token shape
  `resolveVerbGroup`/`resolveCopula` already expect.
- **Wh-questions** ("Who sleeps?", "What do you eat?", "Who is she?") use
  two new interrogative pronouns, `who` (`whType: "person"`) and `what`
  (`whType: "thing"`), which get their own referent type (`"WH"`) rather
  than being folded into `"PRONOUN"` — they don't refer to anything, they're
  what the question is asking to have filled in. Subject wh-questions
  ("who sleeps?") need no special handling at all: the wh-word just fills
  the ordinary subject NP slot, exactly like "someone sleeps" would.
  Non-subject wh-questions ("what do you eat?", "who is she?") invert like
  a polar question because the fronted wh-word vacated the object or
  copula-complement slot — `chunkWhQuestion` parses the inversion the same
  way, then splices the wh-word into whichever slot came up empty.
  Telling "What do you eat?" (object questioned, "do" inverts past its own
  subject "you") apart from "What is on the table?" (subject questioned,
  "what" already *is* the subject and "is" never inverted at all) takes
  actually trying to parse a subject NP right after the auxiliary — both
  look identical for the first two tokens.
  A wh-word standing in for a copula's predicate NP also decides `CLASSIFY`
  vs. `EQUATE` by its own lexical meaning rather than definiteness: "who"
  asks for identity ("Who is she?" → EQUATE), "what" asks for role/category
  ("What is he?" → CLASSIFY, answered "he's a doctor", not a name).

Not handled (deferred, not attempted): adjunct wh-words `where`/`when`/
`why`/`how`, which question an entire location/time/reason/manner adjunct
rather than filling an existing argument slot — that needs new thematic
roles (`time`, `reason`, `manner`) most actions don't define yet, and a way
to question a PP as a whole rather than the NP inside it. Also not
handled: questioning an argument buried inside a PP via preposition
stranding or pied-piping ("Who did you give the gold to?" / "To whom did
you give the gold?").

## Swadesh-207 coverage and its limits

`data/languages/en.json`'s lexicon implements the full Swadesh 207-word
list, except for six items with no grammatical slot in the current parser:
the adjunct interrogatives `where`/`when`/`how` (see "Questions" above —
`who`/`what` **are** supported) and the conjunctions `and`/`if`/`because`
(no multi-clause/subordination grammar). Adding lexicon entries for these
without the grammar to back them up would let them parse silently as
no-ops, which seemed worse than leaving them out and documenting why.
Everything else — all 55 verbs, all
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
