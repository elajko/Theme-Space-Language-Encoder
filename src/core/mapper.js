// Maps a parsed clause onto the universal theme space. This is where
// syntax (subject/object/oblique-with-adposition) gets translated into
// semantics (agent/theme/source/...), guided entirely by the per-verb
// "linking" data supplied by the language file — e.g. English "steal"
// links its object to "theme" while "rob" links its object to "source",
// even though both describe the same STEAL action.
function mapToThemeSpace(parsed, langData, actionsData) {
  if (parsed.isCopula) {
    return mapCopulaToThemeSpace(parsed, actionsData);
  }

  const { beforeChunks, verbGroup, afterChunks } = parsed;

  const objectChunk = afterChunks.find((c) => c.type === 'NP');
  const ppChunks = [...beforeChunks, ...afterChunks].filter((c) => c.type === 'PP');

  let { tense, aspect, mood, polarity } = verbGroup;
  const { subjectNP, imperative } = resolveSubject(beforeChunks);
  if (imperative) {
    mood = 'imperative';
    tense = null;
    aspect = null;
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

// A copula clause has no verb to disambiguate senses for or link roles
// through — "be" always maps onto one of four fixed actions depending only
// on the shape of its complement, and every one of that action's roles is
// filled by construction (there's no optional-role/covert-default logic to
// run, unlike ordinary verbs).
function mapCopulaToThemeSpace(parsed, actionsData) {
  const { beforeChunks, copula, complement } = parsed;
  let { tense, aspect, mood, polarity } = copula;
  const { subjectNP, imperative } = resolveSubject(beforeChunks);
  if (imperative) {
    mood = 'imperative';
    tense = null;
    aspect = null;
  }

  let action;
  let filled;

  if (complement.kind === 'ATTRIBUTE') {
    // "the dog is red": truth-conditionally the same content as "the red
    // dog", just realized predicatively instead of attributively, so the
    // property joins the subject's own modifiers rather than becoming a
    // referent of its own.
    action = 'ATTRIBUTE';
    filled = {
      theme: { ...subjectNP, modifiers: [...(subjectNP.modifiers || []), ...complement.modifiers] },
    };
  } else if (complement.kind === 'LOCATIVE') {
    action = 'BE_LOCATED';
    filled = { theme: subjectNP, location: complement.pp.np };
  } else {
    // NOMINAL complement: "he is a doctor" (indefinite/generic predicate,
    // classifying) vs. "he is the king" / "that is her" (definite predicate
    // or pronoun, identifying). Higgins (1979) and Declerck (1988)
    // distinguish exactly this "predicational" vs. "specificational/
    // equative" split in copular sentences by the definiteness of the
    // postcopular NP.
    // A fronted wh-word as the complement ("who is she?" / "what is he?")
    // follows the same split, but by its own lexical meaning rather than
    // definiteness: "who" asks for identity (EQUATE), "what" asks for
    // role/category (CLASSIFY) -- "What is he?" is answered "he's a doctor",
    // not with a name.
    const predicateNP = complement.np;
    const isEquative = predicateNP.wh
      ? predicateNP.whType === 'person'
      : predicateNP.kind === 'PRONOUN' || predicateNP.definiteness === 'definite';
    action = isEquative ? 'EQUATE' : 'CLASSIFY';
    filled = { theme: subjectNP, [isEquative ? 'identity' : 'category']: predicateNP };
  }

  const actionDef = actionsData[action];
  const referents = actionDef.roles.map((roleDef) => npToReferent(roleDef.theme, filled[roleDef.theme]));

  return [{ predicateType: action, relationToWorld: { tense, aspect, mood, polarity, referents } }];
}

// Shared by both ordinary verbs and copulas: with no overt subject, treat
// the clause as an imperative with an understood 2nd person addressee.
// Unlike a truly omitted optional argument, the referent here is fully
// identifiable — it's just unpronounced — so it's still represented,
// flagged as covert.
function resolveSubject(beforeChunks) {
  const subjectChunk = beforeChunks.find((c) => c.type === 'NP');
  if (subjectChunk) {
    return { subjectNP: subjectChunk.np, imperative: false };
  }
  return {
    subjectNP: {
      kind: 'PRONOUN',
      person: '2nd',
      count: 'singular',
      definiteness: 'definite',
      covert: true,
    },
    imperative: true,
  };
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
  if (np.wh) {
    // "who"/"what" don't refer to anything — they're the very thing the
    // question is asking to have filled in, so they get their own referent
    // type rather than being just another (oddly unspecified) pronoun.
    return { theme: roleName, referent: 'WH', relationToWorld: { whType: np.whType } };
  }

  if (np.kind === 'PRONOUN') {
    const relationToWorld = { person: np.person, count: np.count };
    if (np.gender) relationToWorld.gender = np.gender;
    // Personal pronouns ("me"/"you") are definite; "someone"/"anyone" are
    // indefinite; quantificational pronouns ("everyone"/"nobody") carry a
    // quantifier instead of either, same three-way split as full NPs.
    if (np.definiteness) relationToWorld.definiteness = np.definiteness;
    if (np.quantifier) relationToWorld.quantifier = np.quantifier;
    if (np.distance) relationToWorld.distance = np.distance;
    if (np.covert) relationToWorld.covert = true;
    if (np.modifiers && np.modifiers.length > 0) relationToWorld.modifiers = np.modifiers;
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
