import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve("database/migrations");
const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();

function validateSql(text, file) {
  let i = 0;
  let line = 1;
  let single = false;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;
  let parens = 0;

  const fail = (message) => {
    throw new Error(`${file}:${line}: ${message}`);
  };

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "\n") {
      line += 1;
      lineComment = false;
      i += 1;
      continue;
    }
    if (lineComment) { i += 1; continue; }

    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i += 2; continue; }
      i += 1;
      continue;
    }

    if (single) {
      if (ch === "'" && next === "'") { i += 2; continue; }
      if (ch === "'") { single = false; i += 1; continue; }
      i += 1;
      continue;
    }

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") { lineComment = true; i += 2; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i += 2; continue; }
    if (ch === "'") { single = true; i += 1; continue; }

    if (ch === "$") {
      const match = text.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === "(") parens += 1;
    if (ch === ")") {
      parens -= 1;
      if (parens < 0) fail("unexpected closing parenthesis");
    }
    i += 1;
  }

  if (single) fail("unterminated single-quoted SQL literal");
  if (dollarTag) fail(`unterminated dollar-quoted block ${dollarTag}`);
  if (blockComment) fail("unterminated block comment");
  if (parens !== 0) fail(`unbalanced parentheses (${parens})`);
}

for (const file of files) {
  validateSql(readFileSync(resolve(dir, file), "utf8"), file);
}

console.log(`Migration SQL integrity check passed (${files.length} files).`);
