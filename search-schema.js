// search-schema.js
const fs = require("fs");
const content = fs.readFileSync("c:/Users/Briane/Documents/Projects/san-code-frontend-backend/sanCode-API/controllers/sanCodeBackendControllers.js", "utf8");

// Search for studentFullEntry definition
const lines = content.split("\n");
let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("studentFullEntry =") || lines[i].includes("const studentFullEntry =")) {
    startLine = i;
    break;
  }
}

if (startLine !== -1) {
  // Print 60 lines from startLine
  console.log(`=== Found studentFullEntry at line ${startLine + 1} ===`);
  console.log(lines.slice(startLine, startLine + 100).join("\n"));
} else {
  console.log("studentFullEntry not found.");
}
