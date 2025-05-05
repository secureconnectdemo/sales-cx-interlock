const fs = require("fs");
const path = require("path");

const playcardData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "playcards.json"), "utf8")
);

function getPlaycard(segment, task) {
  const seg = playcardData[segment];
  if (!seg) return null;
  return seg[task] || null;
}

module.exports = { getPlaycard };
