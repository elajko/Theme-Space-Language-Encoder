const { resolveVerbGroup, resolveCopula } = require('./verbGroup');

// Splits a lexed token stream into: the material before the verb, the verb
// group itself, and the material after the verb. Assumes a single main
// clause with one (possibly periphrastic) verb group — no subordination,
// coordination, or discontinuous verb groups.
function chunk(lexTokens) {
  const hasWh = lexTokens.some((t) => t.wh);
  const isFrontedAux = Boolean(lexTokens[0] && lexTokens[0].pos === 'AUX' && lexTokens[0].tense);
  // "What do you eat?" (object questioned: "do" fronts, "you" is its own
  // subject following it) vs. "What is on the table?" / "What is red?"
  // (subject questioned: "what" already IS the subject, "is" is just the
  // ordinary un-inverted copula for it, same as "the book is on the
  // table"). Both start with wh-word + tensed AUX, so telling them apart
  // means actually trying to parse a subject NP after that AUX (skipping a
  // possible fused NEG) — if one's there, the AUX inverted past it; if not,
  // there's no inversion and the wh-word is the subject.
  const isFrontedWh = Boolean(
    lexTokens[0] &&
      lexTokens[0].wh &&
      lexTokens[1] &&
      lexTokens[1].pos === 'AUX' &&
      lexTokens[1].tense &&
      hasInvertedSubjectAfter(lexTokens, 1)
  );

  let result;
  if (isFrontedWh) {
    result = chunkWhQuestion(lexTokens);
  } else if (isFrontedAux) {
    result = chunkPolarQuestion(lexTokens);
  } else {
    result = chunkDeclarative(lexTokens);
  }

  // Every path above builds its tense/aspect/etc. via resolveVerbGroup or
  // resolveCopula, which always default to mood "indicative" — override it
  // here in one place, rather than in each branch, for both question types
  // (a fronted wh-word forces interrogative mood regardless of inversion,
  // since a subject wh-question like "who sleeps?" never inverts at all).
  if (hasWh || isFrontedAux || isFrontedWh) {
    if (result.isCopula) {
      result.copula.mood = 'interrogative';
    } else {
      result.verbGroup.mood = 'interrogative';
    }
  }
  return result;
}

function hasInvertedSubjectAfter(lexTokens, auxIndex) {
  const hasLeadingNeg = lexTokens[auxIndex + 1] && lexTokens[auxIndex + 1].pos === 'NEG';
  const subjectIndex = auxIndex + 1 + (hasLeadingNeg ? 1 : 0);
  return Boolean(parseNPOnlyAt(lexTokens, subjectIndex));
}

function chunkDeclarative(lexTokens) {
  const isVerbGroupPart = (t) => t.pos === 'AUX' || t.pos === 'V' || t.pos === 'NEG';
  const vgStart = lexTokens.findIndex((t) => t.pos === 'AUX' || t.pos === 'V');
  if (vgStart === -1) {
    throw new Error('No verb found in sentence.');
  }

  // NEG ("not") is swept into the verb group too, since it only ever attaches
  // between an auxiliary and the main verb (e.g. "do not sleep"), never
  // functioning as an NP/PP element itself.
  let vgEnd = vgStart;
  while (vgEnd + 1 < lexTokens.length && isVerbGroupPart(lexTokens[vgEnd + 1])) {
    vgEnd++;
  }

  const verbParts = lexTokens.slice(vgStart, vgEnd + 1);
  const before = lexTokens.slice(0, vgStart);
  const after = lexTokens.slice(vgEnd + 1);
  const beforeChunks = chunkNPsAndPPs(before);

  if (verbParts.some((p) => p.pos === 'V')) {
    const verbGroup = resolveVerbGroup(verbParts);
    const afterChunks = chunkNPsAndPPs(after);
    return { beforeChunks, verbGroup, afterChunks };
  }

  // No lexical main verb — either a copular/predicative clause ("the dog is
  // red"), where "be" itself is the predicate, or a genuinely unsupported
  // fragment (a modal/dummy auxiliary with nothing after it).
  if (!verbParts.some((p) => p.pos === 'AUX' && p.lemma === 'be')) {
    throw new Error('No lexical main verb found (copular/predicative sentences need "be").');
  }
  const copula = resolveCopula(verbParts);
  const complement = chunkCopulaComplement(after);
  return { beforeChunks, isCopula: true, copula, complement };
}

// Shared by polar questions and non-subject wh-questions: both invert a
// fronted auxiliary past the subject. Peels off aux1 (+ a fused leading
// NEG, for contracted negation like "Isn't the dog red?" — contraction
// expansion puts "not" right after "is", ahead of the subject), parses
// exactly one subject NP after that, and sweeps the rest as an ordinary
// verb group. Deliberately leaves `after` unparsed: polar questions and
// wh-questions disagree on what an empty `after` means (an error, vs. "the
// fronted wh-word fills that slot").
function parseInvertedClause(lexTokens) {
  const aux1 = lexTokens[0];
  const hasLeadingNeg = lexTokens[1] && lexTokens[1].pos === 'NEG';
  const leadingNeg = hasLeadingNeg ? [lexTokens[1]] : [];
  const subjectStart = 1 + leadingNeg.length;

  const subjectResult = parseNPOnlyAt(lexTokens, subjectStart);
  if (!subjectResult) {
    throw new Error('Could not find a subject after the fronted auxiliary in this question.');
  }
  const beforeChunks = [{ type: 'NP', np: subjectResult.np }];

  const rest = lexTokens.slice(subjectResult.nextIndex);
  const isVerbGroupPart = (t) => t.pos === 'AUX' || t.pos === 'V' || t.pos === 'NEG';
  let vgEnd = -1;
  while (vgEnd + 1 < rest.length && isVerbGroupPart(rest[vgEnd + 1])) {
    vgEnd++;
  }
  const verbParts = [aux1, ...leadingNeg, ...rest.slice(0, vgEnd + 1)];
  const after = rest.slice(vgEnd + 1);

  return { beforeChunks, verbParts, after };
}

function chunkPolarQuestion(lexTokens) {
  const { beforeChunks, verbParts, after } = parseInvertedClause(lexTokens);

  if (verbParts.some((p) => p.pos === 'V')) {
    const verbGroup = resolveVerbGroup(verbParts);
    const afterChunks = chunkNPsAndPPs(after);
    return { beforeChunks, verbGroup, afterChunks };
  }

  if (!verbParts.some((p) => p.pos === 'AUX' && p.lemma === 'be')) {
    throw new Error('No lexical main verb found in this question (and no copula "be" either).');
  }
  const copula = resolveCopula(verbParts);
  const complement = chunkCopulaComplement(after);
  return { beforeChunks, isCopula: true, copula, complement };
}

// "What do you eat?" / "Who is she?": the wh-word was fronted from the
// object slot (ordinary verb) or the complement slot (copula), and its
// departure is why the auxiliary inverted with the subject in the first
// place. Parse the inverted clause as usual, then splice the wh-word into
// whichever slot its fronting left empty.
function chunkWhQuestion(lexTokens) {
  const whToken = lexTokens[0];
  const whNP = {
    kind: 'PRONOUN',
    wh: true,
    whType: whToken.whType,
    person: whToken.person,
    count: whToken.count,
  };

  const { beforeChunks, verbParts, after } = parseInvertedClause(lexTokens.slice(1));

  if (verbParts.some((p) => p.pos === 'V')) {
    const verbGroup = resolveVerbGroup(verbParts);
    const afterChunks = [{ type: 'NP', np: whNP }, ...chunkNPsAndPPs(after)];
    return { beforeChunks, verbGroup, afterChunks };
  }

  if (!verbParts.some((p) => p.pos === 'AUX' && p.lemma === 'be')) {
    throw new Error('No lexical main verb found in this question (and no copula "be" either).');
  }
  const copula = resolveCopula(verbParts);
  // Nothing left after the subject ("what is he?") means the wh-word itself
  // is the fronted predicate nominal/identity, not an ordinary complement.
  const complement = after.length === 0 ? { kind: 'NOMINAL', np: whNP } : chunkCopulaComplement(after);
  return { beforeChunks, isCopula: true, copula, complement };
}

// The copula's complement is NOT a normal object/oblique: it can be a bare
// predicate adjective with no head noun at all ("is red"), which the
// ordinary NP grammar can't produce (it always requires an N/PRON head).
// So a bare run of ADJs is handled specially; anything else (a predicate
// nominal, predicate pronoun, or locative PP) reuses the ordinary grammar.
function chunkCopulaComplement(tokens) {
  if (tokens.length === 0) {
    throw new Error(
      'Copular sentence has no complement (expected e.g. "is red", "is a dog", "is in the house").'
    );
  }
  if (tokens.every((t) => t.pos === 'ADJ')) {
    return { kind: 'ATTRIBUTE', modifiers: tokens.map((t) => t.concept) };
  }

  const complementChunks = chunkNPsAndPPs(tokens);
  if (complementChunks.length !== 1) {
    throw new Error(
      'Unsupported copular complement (expected a single predicate adjective, noun phrase, or prepositional phrase).'
    );
  }
  const [complementChunk] = complementChunks;
  return complementChunk.type === 'PP'
    ? { kind: 'LOCATIVE', pp: complementChunk }
    : { kind: 'NOMINAL', np: complementChunk.np };
}

// Generic phrase grammar: PP := ADP? NP, NP := DET? NUM? ADJ* (N|PRON).
// Nothing here is English-specific; word order, agreement patterns, and
// vocabulary are all supplied by the language data file via each token's
// POS tag and features.
function chunkNPsAndPPs(tokens) {
  const chunks = [];
  let i = 0;

  while (i < tokens.length) {
    const result = parseNPAt(tokens, i);
    if (!result) {
      // Malformed fragment (e.g. a bare adposition/determiner with no head
      // noun following it). Skip forward rather than looping forever.
      i++;
      continue;
    }
    chunks.push(result.chunk);
    i = result.nextIndex;
  }

  return chunks;
}

// Parses PP := ADP? NP starting at index i. Returns null if no NP (with or
// without a leading adposition) starts there.
function parseNPAt(tokens, i) {
  let adp = null;
  if (tokens[i] && tokens[i].pos === 'ADP') {
    adp = tokens[i];
    i++;
  }
  const result = parseNPOnlyAt(tokens, i);
  if (!result) {
    return null;
  }
  const chunk = adp ? { type: 'PP', adp, np: result.np } : { type: 'NP', np: result.np };
  return { chunk, nextIndex: result.nextIndex };
}

// Parses NP := DET? NUM? ADJ* (N|PRON) starting at index i, with no leading
// adposition allowed — used directly wherever a bare NP (never a PP) is
// expected, e.g. a subject. Returns null if no NP starts there.
function parseNPOnlyAt(tokens, i) {
  let det = null;
  if (tokens[i] && tokens[i].pos === 'DET') {
    det = tokens[i];
    i++;
  }

  let num = null;
  if (tokens[i] && tokens[i].pos === 'NUM') {
    num = tokens[i];
    i++;
  }

  const adjs = [];
  while (tokens[i] && tokens[i].pos === 'ADJ') {
    adjs.push(tokens[i]);
    i++;
  }

  const head = tokens[i];
  if (!head || (head.pos !== 'N' && head.pos !== 'PRON')) {
    return null;
  }
  i++;

  return { np: buildNP(det, num, adjs, head), nextIndex: i };
}

function buildNP(det, num, adjs, head) {
  if (head.pos === 'PRON') {
    return {
      kind: 'PRONOUN',
      person: head.person,
      count: head.count,
      gender: head.gender,
      definiteness: head.definiteness,
      quantifier: head.quantifier,
      distance: head.distance,
      wh: head.wh,
      whType: head.whType,
    };
  }

  // "a"/"an" specifically (not every indefinite determiner -- "many"/
  // "some"/"no"/etc. are indefinite too, but combine with plural nouns
  // just fine) are grammatically singular-only in English, so they
  // override even an invariant-plural noun's own default count -- "a fish"
  // is unambiguously one fish, regardless of "fish" defaulting to "plural"
  // when bare (see gen_en.py). The indefinite article is the one indefinite
  // determiner with no quantifier of its own, which is what distinguishes
  // it here.
  const isIndefiniteArticle = det && det.definiteness === 'indefinite' && !det.quantifier;
  const count =
    num
      ? (num.value === 1 ? 'singular' : 'plural')
      : isIndefiniteArticle
        ? 'singular'
        : head.count || 'singular';
  const definiteness = resolveDefiniteness(det, num, head, count);

  return {
    kind: 'NOUN',
    concept: (head.concept || head.word).toUpperCase(),
    definiteness,
    distance: det ? det.distance : undefined,
    quantifier: det ? det.quantifier : undefined,
    possessor: det ? det.possessor : undefined,
    quantity: num ? num.value : undefined,
    // Kind reference (Carlson 1977) denotes the kind as a single, unified
    // entity, not some number of individuals -- "dogs" in "dogs bark" isn't
    // "several dogs", it's one kind, and "water" in "water is wet" isn't
    // singular either. The plural/mass marking on a bare generic NP is just
    // the syntactic vehicle English uses to express kind reference, not a
    // semantic claim about cardinality, so count doesn't apply and there
    // isn't a sensible value (singular or plural) to report — omitted
    // rather than forced to one.
    count: definiteness === 'generic' ? undefined : count,
    modifiers: adjs.map((a) => a.concept),
  };
}

// English's three-way split (Carlson 1977; Krifka et al. 1995,
// "Genericity: An Introduction"): a determiner-less plural or mass noun
// ("dogs", "water") doesn't refer to some existing specific dog(s)/water —
// it names the kind itself ("kind reference"/"D-genericity"), which is a
// different thing from both "the dog" (definite) and "a dog" (indefinite).
// Quantificational determiners ("every dog", "no bread", "many dogs") get
// one of these same three values too — every determiner in the lexicon
// carries its own "definiteness" (see gen_en.py for the weak/strong
// classification behind each one) — plus a separate "quantifier" field for
// which one, exactly.
function resolveDefiniteness(det, num, head, count) {
  if (det && det.definiteness) {
    return det.definiteness;
  }
  if (num) {
    // A bare numeral ("two dogs") asserts the existence of a specific
    // count of individuals -- existential, like "a dog", just not
    // restricted to one. Not kind reference: Carlson/Krifka's kind-
    // denoting bare NPs are specifically determiner-*and*-numeral-less.
    return 'indefinite';
  }
  if (count === 'plural' || head.mass) {
    return 'generic';
  }
  // No determiner, no numeral, bare singular count noun ("I eat cat"):
  // genuinely unmarked/rare in English and not confidently classifiable as
  // definite, indefinite, or generic, so nothing is reported rather than
  // guessing at a value.
  return undefined;
}

module.exports = { chunk };
