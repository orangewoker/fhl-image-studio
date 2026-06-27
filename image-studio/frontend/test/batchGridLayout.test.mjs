import test from "node:test";
import assert from "node:assert/strict";
import { planBatchGridLayout } from "../src/components/canvas/batchGridLayout.ts";

test("batch grid keeps small result sets readable", () => {
  const layout = planBatchGridLayout(4, 900, 640);
  assert.equal(layout.columns, 2);
  assert.equal(layout.rows, 2);
  assert.equal(layout.density, "comfortable");
});

test("batch grid uses one row for five wide-canvas results", () => {
  const layout = planBatchGridLayout(5, 857, 618);
  assert.equal(layout.columns, 5);
  assert.equal(layout.rows, 1);
  assert.ok(layout.tileWidth >= 150);
});

test("batch grid wraps after five wide-canvas results by default", () => {
  const layout = planBatchGridLayout(6, 857, 618);
  assert.equal(layout.columns, 5);
  assert.equal(layout.rows, 2);
});

test("batch grid uses more than three columns for medium batches", () => {
  const layout = planBatchGridLayout(9, 900, 640);
  assert.equal(layout.columns, 5);
  assert.ok(layout.tileWidth >= 150);
});

test("batch grid spreads common batches across the canvas", () => {
  const layout = planBatchGridLayout(12, 900, 640);
  assert.equal(layout.columns, 6);
  assert.equal(layout.rows, 2);
  assert.ok(layout.tileWidth >= 135);
});

test("batch grid avoids sparse trailing rows for fifteen results", () => {
  const layout = planBatchGridLayout(15, 900, 640);
  assert.equal(layout.columns, 5);
  assert.equal(layout.rows, 3);
  assert.ok(layout.tileWidth >= 120);
});

test("batch grid balances twenty results into a result wall", () => {
  const layout = planBatchGridLayout(20, 900, 640);
  assert.equal(layout.columns, 7);
  assert.equal(layout.rows, 3);
  assert.ok(layout.tileWidth >= 115);
});

test("batch grid becomes dense for large continuous test batches", () => {
  const layout = planBatchGridLayout(31, 900, 640);
  assert.ok(layout.columns >= 8);
  assert.ok(layout.rows <= 4);
  assert.ok(layout.tileWidth >= 90);
});

test("batch grid uses a balanced wall for forty stress-test slots", () => {
  const layout = planBatchGridLayout(40, 900, 640);
  assert.equal(layout.columns, 10);
  assert.equal(layout.rows, 4);
  assert.equal(layout.density, "dense");
});

test("batch grid allows micro thumbnails for very large batches", () => {
  const layout = planBatchGridLayout(60, 900, 640);
  assert.ok(layout.columns >= 10);
  assert.equal(layout.density, "micro");
});

test("batch grid caps stress-test rows at ten columns", () => {
  const layout = planBatchGridLayout(100, 900, 640);
  assert.equal(layout.columns, 10);
  assert.equal(layout.rows, 10);
  assert.equal(layout.density, "dense");
  assert.ok(layout.gap <= 6);
});

test("batch grid keeps the default overview when no column override is provided", () => {
  const defaultLayout = planBatchGridLayout(100, 900, 640);
  const implicitLayout = planBatchGridLayout(100, 900, 640, {});
  assert.deepEqual(implicitLayout, defaultLayout);
});

test("batch grid can zoom in by reducing columns and increasing tile size", () => {
  const overview = planBatchGridLayout(100, 900, 640);
  const zoomed = planBatchGridLayout(100, 900, 640, { columnsOverride: overview.columns - 1 });
  assert.equal(zoomed.columns, overview.columns - 1);
  assert.ok(zoomed.tileWidth > overview.tileWidth);
  assert.ok(zoomed.rows > overview.rows);
});

test("batch grid fixed columns can overflow vertically for scrollable zoom views", () => {
  const zoomed = planBatchGridLayout(100, 900, 640, { columnsOverride: 5 });
  const usedHeight = zoomed.rows * zoomed.tileHeight + (zoomed.rows - 1) * zoomed.gap;
  assert.equal(zoomed.columns, 5);
  assert.ok(zoomed.tileWidth >= 150);
  assert.ok(usedHeight > 640);
});

test("batch grid supports the preferred six-column browsing view", () => {
  const overview = planBatchGridLayout(100, 900, 640);
  const browsing = planBatchGridLayout(100, 900, 640, { columnsOverride: 6 });
  const usedHeight = browsing.rows * browsing.tileHeight + (browsing.rows - 1) * browsing.gap;
  assert.equal(browsing.columns, 6);
  assert.ok(browsing.tileWidth > overview.tileWidth);
  assert.ok(usedHeight > 640);
});

test("batch grid clamps fixed columns to the supported one-to-ten range", () => {
  assert.equal(planBatchGridLayout(4, 900, 640, { columnsOverride: 99 }).columns, 10);
  assert.equal(planBatchGridLayout(4, 900, 640, { columnsOverride: 10 }).columns, 10);
  assert.equal(planBatchGridLayout(4, 900, 640, { columnsOverride: 0 }).columns, 2);
  assert.equal(planBatchGridLayout(4, 900, 640, { columnsOverride: -2 }).columns, 2);
});
