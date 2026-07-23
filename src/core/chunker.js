const { resolveVerbGroup } = require('./verbGroup');

// Splits a lexed token stream into: the material before the verb, the verb
// group itself, and the material after the verb. Assumes a single main
// clause with one (possibly periphrastic) verb group — no subordination,
// coordination, or discontinuous verb groups.
function chunk(lexTokens) {
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

  const verbGroup = resolveVerbGroup(verbParts);
  const beforeChunks = chunkNPsAndPPs(before);
  const afterChunks = chunkNPsAndPPs(after);

  return { beforeChunks, verbGroup, afterChunks };
}

// Generic phrase grammar: PP := ADP? NP, NP := DET? NUM? ADJ* (N|PRON).
// Nothing here is English-specific; word order, agreement patterns, and
// vocabulary are all supplied by the language data file via each token's
// POS tag and features.
function chunkNPsAndPPs(tokens) {
  const chunks = [];
  let i = 0;

  while (i < tokens.length) {
    let adp = null;
    if (tokens[i] && tokens[i].pos === 'ADP') {
      adp = tokens[i];
      i++;
    }

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
      // Malformed fragment (e.g. a bare adposition/determiner with no head
      // noun following it). Skip forward rather than looping forever.
      i++;
      continue;
    }
    i++;

    const np = buildNP(det, num, adjs, head);
    if (adp) {
      chunks.push({ type: 'PP', adp, np });
    } else {
      chunks.push({ type: 'NP', np });
    }
  }

  return chunks;
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
