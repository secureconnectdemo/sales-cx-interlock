const fs = require("fs");
const path = require("path");

const playcardData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "playcards.json"), "utf8")
);

function getPlaycard(segment, task) {
  const seg = playcardData[segment];
  if (!seg) return null;

  const matchKey = Object.keys(seg).find(k => k.toLowerCase() === task.toLowerCase());
  return matchKey ? seg[matchKey] : null;
}


module.exports = { getPlaycard };
