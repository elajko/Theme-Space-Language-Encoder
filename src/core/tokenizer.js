function tokenize(sentence) {
  return sentence
    .toLowerCase()
    // Normalize curly apostrophes to straight ones so contraction lookup
    // (which happens after this, on a fixed apostrophe form) is reliable.
    .replace(/[‘’]/g, "'")
    // Strip other punctuation, but keep apostrophes — contractions like
    // "didn't" need theirs intact to be recognized and expanded.
    .replace(/[.,!?;:"]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

module.exports = { tokenize };
