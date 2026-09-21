import fs from "fs";

const path = "src/services/mock/seed-bulk.ts";
let s = fs.readFileSync(path, "utf8");

// push(..., rec(..., [makeLine(...)]), -> push(..., rec(..., [makeLine(...)])),
s = s.replace(/(\[makeLine\(\{[\s\S]*?\}\)\]),(\r?\n\s+\);)/g, "$1),$2");

fs.writeFileSync(path, s);
console.log("fixed");
