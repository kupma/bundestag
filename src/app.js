import { computeDivergence } from "./analysis.js";

const status = document.querySelector("#status");
const plenumList = document.querySelector("#plenum-list");
const brochureList = document.querySelector("#brochure-list");
const analysisRows = document.querySelector("#analysis-rows");

const renderList = (element, rows, formatter) => {
  element.innerHTML = "";
  for (const row of rows) {
    const li = document.createElement("li");
    li.textContent = formatter(row);
    element.appendChild(li);
  }
};

const renderAnalysis = (rows) => {
  analysisRows.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.decisionTopic}</td><td>${row.closestBrochureTopic}</td><td>${row.divergence}</td>`;
    analysisRows.appendChild(tr);
  }
};

const loadJson = async (path) => {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
};

const bootstrap = async () => {
  status.textContent = "Loading latest data…";
  try {
    const [plenums, brochures] = await Promise.all([
      loadJson("./data/plenums.json"),
      loadJson("./data/vote-brochures.json"),
    ]);

    renderList(plenumList, plenums.decisions, (decision) =>
      `${decision.topic}: ${decision.summary}`
    );
    renderList(brochureList, brochures.topics, (topic) =>
      `${topic.topic}: ${topic.position}`
    );

    const analysis = computeDivergence(plenums.decisions, brochures.topics);
    renderAnalysis(analysis);

    status.textContent = `Loaded ${plenums.decisions.length} decisions and ${brochures.topics.length} brochure topics.`;
  } catch (error) {
    status.textContent = `Could not load data: ${error.message}`;
  }
};

bootstrap();
