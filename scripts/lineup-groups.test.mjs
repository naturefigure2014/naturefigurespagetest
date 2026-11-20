import assert from "node:assert/strict";
import test from "node:test";
import { groupLineup } from "../src/lib/lineup-groups.mjs";

const lineup = [{ id: "series/001" }, { id: "series/002/index.md" }, { id: "series/003" }];

test("keeps the existing single lineup when groups are absent", () => {
  assert.deepEqual(groupLineup(lineup, []), [{ title: "ラインナップ", figures: lineup }]);
});

test("uses group headings and figure order, normalizing content IDs", () => {
  assert.deepEqual(groupLineup(lineup, [
    { title: "北", figureIds: ["series/002", "series/001"] },
    { title: "南", figureIds: ["series/003"] }
  ]), [
    { title: "北", figures: [lineup[1], lineup[0]] },
    { title: "南", figures: [lineup[2]] }
  ]);
});

test("rejects missing, duplicate, and ungrouped figures", () => {
  assert.throws(() => groupLineup(lineup, [{ title: "北", figureIds: ["series/999"] }]), /missing figure/);
  assert.throws(() => groupLineup(lineup, [{ title: "北", figureIds: ["series/001", "series/001/index"] }]), /multiple lineup groups/);
  assert.throws(() => groupLineup(lineup, [{ title: "北", figureIds: ["series/001"] }]), /missing from lineup groups/);
});
