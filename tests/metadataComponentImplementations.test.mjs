import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const implementationFile = path.join(root, "src/components/metadata/componentImplementations.js");
const source = fs.readFileSync(implementationFile, "utf8");

test("metadata component implementation registry has no business page imports", () => {
  assert.equal(/pages\/(sales|products|purchases|suppliers|till|kiosk)/i.test(source), false);
});

test("core reusable components live in separate versioned files", () => {
  const expected = [
    "table/TableV1.jsx","button/ButtonV1.jsx","container/ContainerV1.jsx",
    "multi-container/MultiContainerV1.jsx","tree-view/TreeViewV1.jsx","process-path/ProcessPathV1.jsx",
    "header/HeaderV1.jsx","text/TextV1.jsx","divider/DividerV1.jsx","spacer/SpacerV1.jsx",
    "related-list/RelatedListV1.jsx","field-value/FieldValueV1.jsx",
  ];
  for (const relative of expected) {
    assert.equal(fs.existsSync(path.join(root, "src/components/metadata", relative)), true, relative);
  }
});

test("implementation registry uses stable versioned APIs", () => {
  for (const api of ["table.v1","button.v1","container.v1","multi_container.v1","tree_view.v1","process_path.v1"]) {
    assert.match(source, new RegExp('"' + api.replace(".", "\\.") + '"'));
  }
});
