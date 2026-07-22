function tokenize(sentence) {
  return sentence
    .toLowerCase()
    .replace(/[.,!?;:"']/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

module.exports = { tokenize };
