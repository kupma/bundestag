const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const keywordSet = (text) => new Set(normalize(text));

const overlap = (left, right) => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }

  return shared / Math.max(left.size, right.size);
};

export const computeDivergence = (decisions, brochureTopics) => {
  return decisions.map((decision) => {
    const decisionKeywords = keywordSet(`${decision.topic} ${decision.summary}`);

    let bestTopic = null;
    let bestAlignment = 0;

    for (const topic of brochureTopics) {
      const topicKeywords = keywordSet(`${topic.topic} ${topic.position}`);
      const alignment = overlap(decisionKeywords, topicKeywords);
      if (alignment > bestAlignment) {
        bestAlignment = alignment;
        bestTopic = topic;
      }
    }

    return {
      decisionId: decision.id,
      decisionTopic: decision.topic,
      closestBrochureTopic: bestTopic?.topic ?? "No related topic",
      divergence: Number((1 - bestAlignment).toFixed(2)),
    };
  });
};
