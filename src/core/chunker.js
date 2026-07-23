const { resolveVerbGroup, resolveCopula } = require('./verbGroup');

// Splits a lexed token stream into: the material before the verb, the verb
// group itself, and the material after the verb. Assumes a single main
// clause with one (possibly periphrastic) verb group — no subordination,
// coordination, or discontinuous verb groups.
function chunk(lexTokens) {
  // Polar (yes/no) questions front the first auxiliary ahead of the
  // subject ("Do you sleep?", "Is the dog red?") — a tensed AUX in
  // sentence-initial position is otherwise impossible in this grammar
  // (declaratives are always subject-first), so it's an unambiguous signal.
  // A *bare* (untensed) leading AUX is instead the copular imperative
  // ("Be good") already supported, which is why this checks for a tense.
  if (lexTokens[0] && lexTokens[0].pos === 'AUX' && lexTokens[0].tense) {
    return chunkPolarQuestion(lexTokens);
  }

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

// Only the fronted auxiliary inverts with the subject — any further
// auxiliaries in the chain stay put next to the main verb/complement
// ("Has she been sleeping?": "has" fronts, "she" follows it, "been
// sleeping" stays together). So: peel off aux1 (+ a fused leading NEG, for
// contracted negation like "Isn't the dog red?" — contraction expansion
// puts "not" right after "is", ahead of the subject), parse exactly one
// subject NP after that, then sweep the rest as an ordinary verb group.
function chunkPolarQuestion(lexTokens) {
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
  const restVerbParts = rest.slice(0, vgEnd + 1);
  const after = rest.slice(vgEnd + 1);
  const verbParts = [aux1, ...leadingNeg, ...restVerbParts];

  if (verbParts.some((p) => p.pos === 'V')) {
    const verbGroup = { ...resolveVerbGroup(verbParts), mood: 'interrogative' };
    const afterChunks = chunkNPsAndPPs(after);
    return { beforeChunks, verbGroup, afterChunks };
  }

  if (!verbParts.some((p) => p.pos === 'AUX' && p.lemma === 'be')) {
    throw new Error('No lexical main verb found in this question (and no copula "be" either).');
  }
  const copula = { ...resolveCopula(verbParts), mood: 'interrogative' };
  const complement = chunkCopulaComplement(after);
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
    };
  }

  const count = num ? (num.value === 1 ? 'singular' : 'plural') : head.count || 'singular';

  return {
    kind: 'NOUN',
    concept: (head.concept || head.word).toUpperCase(),
    definiteness: resolveDefiniteness(det, head, count),
    distance: det ? det.distance : undefined,
    quantifier: det ? det.quantifier : undefined,
    possessor: det ? det.possessor : undefined,
    quantity: num ? num.value : undefined,
    count,
    modifiers: adjs.map((a) => a.concept),
  };
}

// English's three-way split (Carlson 1977; Krifka et al. 1995,
// "Genericity: An Introduction"): a determiner-less plural or mass noun
// ("dogs", "water") doesn't refer to some existing specific dog(s)/water —
// it names the kind itself ("kind reference"/"D-genericity"), which is a
// different thing from both "the dog" (definite) and "a dog" (indefinite).
// Quantified NPs ("every dog", "no bread") are left with no definiteness at
// all, since quantification is a separate dimension from referentiality.
function resolveDefiniteness(det, head, count) {
  if (det && det.definiteness) {
    return det.definiteness;
  }
  if (det && det.quantifier) {
    return undefined;
  }
  if (count === 'plural' || head.mass) {
    return 'generic';
  }
  return 'unspecified';
}

module.exports = { chunk };
