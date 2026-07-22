const fs = require('fs');
const path = require('path');
const { tokenize } = require('./tokenizer');
const { lex } = require('./lexer');
const { chunk } = require('./chunker');
const { mapToThemeSpace } = require('./mapper');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function loadLanguageData(langCode) {
  const file = path.join(DATA_DIR, 'languages', `${langCode}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No language data file found for language code "${langCode}" (expected ${file}).`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadActions() {
  const file = path.join(DATA_DIR, 'actions.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function encodeSentence(sentence, langCode) {
  const langData = loadLanguageData(langCode);
  const actionsData = loadActions();

  const tokens = tokenize(sentence);
  const lexTokens = lex(tokens, langData);

  const unknown = lexTokens.filter((t) => t.pos === 'UNKNOWN').map((t) => t.word);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown word(s) for language "${langCode}": ${unknown.join(', ')}. ` +
        `Add them to data/languages/${langCode}.json.`
    );
  }

  const parsed = chunk(lexTokens);
  return mapToThemeSpace(parsed, langData, actionsData);
}

module.exports = { encodeSentence, loadLanguageData, loadActions };
