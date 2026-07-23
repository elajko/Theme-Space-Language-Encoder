// Maps a parsed clause onto the universal theme space. This is where
// syntax (subject/object/oblique-with-adposition) gets translated into
// semantics (agent/theme/source/...), guided entirely by the per-verb
// "linking" data supplied by the language file — e.g. English "steal"
// links its object to "theme" while "rob" links its object to "source",
// even though both describe the same STEAL action.
function mapToThemeSpace(parsed, langData, actionsData) {
  const { beforeChunks, verbGroup, afterChunks } = parsed;

  const subjectChunk = beforeChunks.find((c) => c.type === 'NP');
  const objectChunk = afterChunks.find((c) => c.type === 'NP');
  const ppChunks = [...beforeChunks, ...afterChunks].filter((c) => c.type === 'PP');

  let { tense, aspect, mood, polarity } = verbGroup;
  let subjectNP;

  if (subjectChunk) {
    subjectNP = subjectChunk.np;
  } else {
    // No overt subject: treat as an imperative with an understood 2nd
    // person addressee. Unlike a truly omitted optional argument, the
    // referent here is fully identifiable — it's just unpronounced — so
    // it's still represented, flagged as covert.
    mood = 'imperative';
    tense = null;
    aspect = null;
    subjectNP = {
      kind: 'PRONOUN',
      person: '2nd',
      count: 'singular',
      definiteness: 'definite',
      covert: true,
    };
  }

  const verbEntry = langData.verbs[verbGroup.lemma];
  if (!verbEntry) {
    throw new Error(`No lexical entry for verb "${verbGroup.lemma}" in language data.`);
  }

  const presentRoles = new Set(
    ppChunks.flatMap((pp) => langData.lexicon[pp.adp.word].roles || [])
  );

  const sense = disambiguateSense(verbEntry.senses, presentRoles);
  const actionDef = actionsData[sense.action];
  if (!actionDef) {
    throw new Error(`No action definition for "${sense.action}" in actions data.`);
  }

  const filled = {};

  if (sense.linking.subject) {
    filled[sense.linking.subject] = subjectNP;
  }
  if (sense.linking.object && objectChunk) {
    filled[sense.linking.object] = objectChunk.np;
  }

  for (const pp of ppChunks) {
    const candidateRoles = langData.lexicon[pp.adp.word].roles || [];
    // The same adposition can correspond to different roles depending on
    // the governing action (English "to" is a goal for motion verbs but a
    // recipient for transfer verbs) — pick whichever candidate the action
    // actually defines and hasn't already been filled.
    const role = candidateRoles.find(
      (r) => actionDef.roles.some((rd) => rd.theme === r) && !filled[r]
    );
    if (role) {
      filled[role] = pp.np;
    }
  }

  const referents = [];
  for (const roleDef of actionDef.roles) {
    const roleName = roleDef.theme;
    if (filled[roleName]) {
      referents.push(npToReferent(roleName, filled[roleName]));
    } else if (roleDef.optional) {
      if (roleDef.covertDefault) {
        // Conventionalized null object (e.g. English "eat" with no overt
        // theme): no word surfaced, but the referent is still understood
        // to exist, conventionally as the given default concept.
        referents.push({
          theme: roleName,
          referent: 'COVERT',
          relationToWorld: { impliedConcept: roleDef.covertDefault },
        });
      }
      // Otherwise: a genuinely unspecified optional role (e.g. "steal
      // gold" doesn't say who from) is simply left out of the referents.
    } else {
      referents.push({
        theme: roleName,
        referent: 'COVERT',
        relationToWorld: {},
      });
    }
  }

  return [
    {
      predicateType: sense.action,
      relationToWorld: {
        tense,
        aspect,
        mood,
        polarity,
        referents,
      },
    },
  ];
}

function disambiguateSense(senses, presentRoles) {
  const matching = senses.filter((s) =>
    (s.requiresRoles || []).every((r) => presentRoles.has(r))
  );
  const withRequirements = matching.filter((s) => (s.requiresRoles || []).length > 0);
  if (withRequirements.length > 0) {
    return withRequirements[0];
  }
  return matching.find((s) => (s.requiresRoles || []).length === 0) || senses[0];
}

function npToReferent(roleName, np) {
  if (np.kind === 'PRONOUN') {
    const relationToWorld = { person: np.person, count: np.count };
    if (np.gender) relationToWorld.gender = np.gender;
    // Personal pronouns ("me"/"you") are definite; "someone"/"anyone" are
    // indefinite; quantificational pronouns ("everyone"/"nobody") carry a
    // quantifier instead of either, same three-way split as full NPs.
    if (np.definiteness) relationToWorld.definiteness = np.definiteness;
    if (np.quantifier) relationToWorld.quantifier = np.quantifier;
    if (np.covert) relationToWorld.covert = true;
    return { theme: roleName, referent: 'PRONOUN', relationToWorld };
  }

  const relationToWorld = { definiteness: np.definiteness, count: np.count };
  if (np.distance) relationToWorld.distance = np.distance;
  if (np.quantifier) relationToWorld.quantifier = np.quantifier;
  if (np.quantity !== undefined) relationToWorld.quantity = np.quantity;
  if (np.possessor) {
    // A possessive determiner ("my dog") isn't just a definiteness marker —
    // it introduces a referent of its own (the possessor), so it's nested
    // here the same way any other referent is shaped elsewhere.
    const possessorWorld = { person: np.possessor.person, count: np.possessor.count };
    if (np.possessor.gender) possessorWorld.gender = np.possessor.gender;
    relationToWorld.possessor = { referent: 'PRONOUN', relationToWorld: possessorWorld };
  }
  if (np.modifiers && np.modifiers.length > 0) {
    relationToWorld.modifiers = np.modifiers;
  }
  return { theme: roleName, referent: np.concept, relationToWorld };
}

module.exports = { mapToThemeSpace };
