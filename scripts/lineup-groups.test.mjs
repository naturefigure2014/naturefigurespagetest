import assert from "node:assert/strict";
import test from "node:test";
import { groupLineup, orderLineupByFigureIds } from "../src/lib/lineup-groups.mjs";

const lineup = [{ id: "series/001" }, { id: "series/002/index.md" }, { id: "series/003" }];

test("orders listed figures by ID, normalizing IDs and ignoring duplicate or missing entries", () => {
  assert.deepEqual(orderLineupByFigureIds(lineup, [
    "series/003", "series/002", "series/002/index.md", "series/missing", "series/001"
  ]), [lineup[2], lineup[1], lineup[0]]);
});

test("keeps all figures that share a normalized ID", () => {
  const figures = [{ id: "series/001" }, { id: "series/001/index.md" }];
  assert.deepEqual(orderLineupByFigureIds(figures, ["series/001"]), figures);
});

test("keeps the existing single lineup when groups are absent", () => {
  assert.deepEqual(groupLineup(lineup, []), [{ title: "ラインナップ", figures: lineup }]);
});

test("allows an empty or custom heading for an ungrouped lineup", () => {
  assert.deepEqual(groupLineup(lineup, [], ""), [{ title: "", figures: lineup }]);
  assert.deepEqual(groupLineup(lineup, [], "作品"), [{ title: "作品", figures: lineup }]);
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
