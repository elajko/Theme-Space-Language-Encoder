// Expands contracted words into their full multi-word form (e.g. "didn't"
// -> ["did", "not"]) before lexing, since the rest of the pipeline expects
// auxiliaries, negation, and pronouns as separate tokens. The contraction
// table itself is pure per-language data (langData.contractions); this is
// just a generic table-driven substitution over the token stream.
function expandContractions(tokens, langData) {
  const contractions = langData.contractions || {};
  return tokens.flatMap((token) => contractions[token] || [token]);
}

module.exports = { expandContractions };
