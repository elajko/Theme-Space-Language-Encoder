// Resolves a contiguous run of AUX/V tokens into a single verb group: the
// lemma to look up in the language's verb lexicon, plus tense/aspect/mood.
// This is deliberately generic (driven only by the AUX lemmas "be"/"have"/
// "will" and the presence/absence of an auxiliary at all) so it isn't tied
// to English specifically — any language data file that tags its
// auxiliaries with lemma "be"/"have"/"will" gets the same behavior for free.
// A language that marks tense/aspect/mood some other way (affixes, particles)
// would need its own resolver; this one covers English-style periphrasis.
function resolveVerbGroup(parts) {
  const auxes = parts.filter((p) => p.pos === 'AUX');
  const verbs = parts.filter((p) => p.pos === 'V');
  const mainVerb = verbs[verbs.length - 1];
  const lemma = mainVerb.lemma;
  const polarity = parts.some((p) => p.pos === 'NEG') ? 'negative' : 'affirmative';

  let tense = 'present';
  let aspect = 'perfective';
  const mood = 'indicative';

  if (auxes.length === 0) {
    tense = mainVerb.tense || 'present';
    aspect = 'perfective';
  } else {
    const willAux = auxes.find((a) => a.lemma === 'will');
    const haveAux = auxes.find((a) => a.lemma === 'have');
    const beAux = auxes.find((a) => a.lemma === 'be');
    const doAux = auxes.find((a) => a.lemma === 'do');

    if (willAux) {
      tense = 'future';
      aspect = 'perfective';
    } else if (haveAux && beAux) {
      tense = haveAux.tense;
      aspect = 'perfect-imperfective';
    } else if (haveAux) {
      tense = haveAux.tense;
      aspect = 'perfect';
    } else if (beAux) {
      tense = beAux.tense;
      aspect = 'imperfective';
    } else if (doAux) {
      // Dummy "do"-support (e.g. "do not sleep") carries no aspectual
      // meaning of its own — it just hosts the tense that the bare verb
      // would otherwise carry.
      tense = doAux.tense;
      aspect = 'perfective';
    }
  }

  return { lemma, tense, aspect, mood, polarity };
}

module.exports = { resolveVerbGroup };
