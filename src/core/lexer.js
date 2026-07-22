// Attaches each language's lexicon entry to its tokens. Purely mechanical
// lookup — all language-specific knowledge (what a word means, what
// grammatical features it carries) lives in the language data file, not here.
function lex(tokens, langData) {
  return tokens.map((word) => {
    const entry = langData.lexicon[word];
    if (!entry) {
      return { word, pos: 'UNKNOWN' };
    }
    return { word, ...entry };
  });
}

module.exports = { lex };
