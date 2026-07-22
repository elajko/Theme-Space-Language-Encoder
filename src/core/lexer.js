// Attaches each language's lexicon entry to its tokens. Purely mechanical
// lookup — all language-specific knowledge (what a word means, what
// grammatical features it carries) lives in the language data file, not here.
function lex(tokens, langData) {
  const lexed = tokens.map((word) => {
    const entry = langData.lexicon[word];
    if (!entry) {
      return { word, pos: 'UNKNOWN' };
    }
    return { word, ...entry };
  });
  return resolveAmbiguous(lexed);
}

// Some closed-class words are genuinely ambiguous between two parts of
// speech depending on what follows them — English "her" is a determiner in
// "her dog" but a personal pronoun in "I see her". The language file marks
// such words with pos "AMBIG" and a list of candidate readings; this
// resolves each one with a single generic test: if an ADJ or N follows, the
// word is introducing a noun phrase (acting as a determiner), otherwise
// it's standing in for one on its own (acting as a pronoun).
function resolveAmbiguous(lexed) {
  return lexed.map((token, i) => {
    if (token.pos !== 'AMBIG') {
      return token;
    }
    const next = lexed[i + 1];
    const actingAsDeterminer = Boolean(next && (next.pos === 'ADJ' || next.pos === 'N'));
    const reading =
      token.readings.find((r) => (r.pos === 'DET') === actingAsDeterminer) || token.readings[0];
    return { word: token.word, ...reading };
  });
}

module.exports = { lex };
