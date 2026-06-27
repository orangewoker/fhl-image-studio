export type BatchGridDensity = "comfortable" | "compact" | "dense" | "micro";

export type BatchGridLayout = {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  gap: number;
  density: BatchGridDensity;
};

export type BatchGridLayoutOptions = {
  columnsOverride?: number;
};

const TILE_ASPECT = 9 / 14;
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 640;
const GRID_GAP = 10;
const MAX_GRID_COLUMNS = 10;

function gapForCount(count: number) {
  if (count > 80) return 6;
  if (count > 40) return 8;
  return GRID_GAP;
}

function maxTileWidthForCount(count: number) {
  if (count <= 1) return 380;
  if (count <= 2) return 320;
  if (count <= 4) return 260;
  if (count <= 6) return 230;
  if (count <= 12) return 205;
  if (count <= 24) return 170;
  if (count <= 40) return 140;
  if (count <= 80) return 112;
  return 96;
}

function minTileWidthForCount(count: number) {
  if (count <= 2) return 180;
  if (count <= 6) return 136;
  if (count <= 16) return 108;
  if (count <= 36) return 82;
  if (count <= 64) return 62;
  if (count <= 100) return 48;
  return 42;
}

function densityForTileWidth(tileWidth: number): BatchGridDensity {
  if (tileWidth < 68) return "micro";
  if (tileWidth < 96) return "dense";
  if (tileWidth < 142) return "compact";
  return "comfortable";
}

function preferredColumnsForCount(count: number) {
  if (count <= 1) return 1;
  if (count <= 3) return count;
  if (count === 4) return 2;
  if (count <= 5) return count;
  if (count <= 10) return 5;
  if (count <= 12) return 6;
  if (count <= 15) return 5;
  if (count <= 18) return 6;
  if (count <= 21) return 7;
  if (count <= 24) return 8;
  if (count <= 32) return 8;
  if (count <= 42) return 10;
  if (count <= 56) return 10;
  return MAX_GRID_COLUMNS;
}

function preferredColumnWeight(count: number) {
  if (count <= 4) return 18_000;
  if (count <= 6) return 32_000;
  if (count <= 8) return 12_000;
  if (count <= 24) return 5_000;
  return 3_000;
}

function incompleteLastRowPenalty(count: number, columns: number, rows: number) {
  if (rows <= 1) return 0;
  const lastRow = count % columns;
  if (lastRow === 0) return 0;

  const missingSlots = columns - lastRow;
  const basePenalty = count <= 24 ? 4_800 : count <= 60 ? 1_800 : 700;
  const sparseLastRowPenalty = lastRow <= Math.max(2, Math.floor(columns * 0.4)) ? basePenalty * 1.4 : 0;
  return missingSlots * basePenalty + sparseLastRowPenalty;
}

function preferredColumnsForAvailableWidth(
  count: number,
  width: number,
  gap: number,
  minTileWidth: number,
  preferredColumns: number,
) {
  if (preferredColumns <= 1) return preferredColumns;

  const preferredTileWidth = (width - gap * (preferredColumns - 1)) / preferredColumns;
  const minReadableWidth = minTileWidth * 0.82;
  if (preferredTileWidth >= minReadableWidth) return preferredColumns;

  const widthSafeColumns = Math.floor((width + gap) / (minReadableWidth + gap));
  return Math.max(1, Math.min(count, preferredColumns, widthSafeColumns));
}

function fixedColumnsLayout(
  count: number,
  width: number,
  gap: number,
  columnsOverride: number,
): BatchGridLayout {
  const columns = Math.max(1, Math.min(MAX_GRID_COLUMNS, Math.round(columnsOverride)));
  const rows = Math.ceil(count / columns);
  const columnGap = gap * (columns - 1);
  const widthLimited = Math.max(1, (width - columnGap) / columns);
  const zoomMaxTileWidth = maxTileWidthForCount(columns);
  const tileWidth = Math.floor(Math.min(widthLimited, zoomMaxTileWidth));
  const tileHeight = Math.floor(tileWidth / TILE_ASPECT);

  return {
    columns,
    rows,
    tileWidth: Math.max(1, tileWidth),
    tileHeight: Math.max(1, tileHeight),
    gap,
    density: densityForTileWidth(tileWidth),
  };
}

export function planBatchGridLayout(
  count: number,
  containerWidth: number,
  containerHeight: number,
  options: BatchGridLayoutOptions = {},
): BatchGridLayout {
  const safeCount = Math.max(1, count);
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : DEFAULT_WIDTH;
  const height = Number.isFinite(containerHeight) && containerHeight > 0 ? containerHeight : DEFAULT_HEIGHT;
  const gap = gapForCount(safeCount);
  if (Number.isFinite(options.columnsOverride) && Number(options.columnsOverride) > 0) {
    return fixedColumnsLayout(safeCount, width, gap, Number(options.columnsOverride));
  }

  const minTileWidth = minTileWidthForCount(safeCount);
  const maxTileWidth = maxTileWidthForCount(safeCount);
  const rawPreferredColumns = Math.min(safeCount, preferredColumnsForCount(safeCount));
  const preferredColumns = preferredColumnsForAvailableWidth(
    safeCount,
    width,
    gap,
    minTileWidth,
    rawPreferredColumns,
  );
  const preferredWeight = preferredColumnWeight(safeCount);
  const maxColumnsByWidth = Math.max(1, Math.floor((width + gap) / (minTileWidth + gap)));
  const maxColumns = Math.min(
    safeCount,
    MAX_GRID_COLUMNS,
    Math.max(maxColumnsByWidth, Math.min(safeCount, rawPreferredColumns + 3)),
  );

  let best: (BatchGridLayout & { score: number }) | null = null;

  for (let columns = 1; columns <= maxColumns; columns += 1) {
    const rows = Math.ceil(safeCount / columns);
    const columnGap = gap * (columns - 1);
    const rowGap = gap * (rows - 1);
    const widthLimited = Math.max(1, (width - columnGap) / columns);
    const heightLimited = Math.max(1, ((height - rowGap) * TILE_ASPECT) / rows);
    const canFitHeight = heightLimited >= minTileWidth;
    const tileWidth = Math.floor(
      canFitHeight
        ? Math.min(widthLimited, heightLimited, maxTileWidth)
        : Math.min(widthLimited, maxTileWidth),
    );
    const tileHeight = Math.floor(tileWidth / TILE_ASPECT);
    const usedWidth = columns * tileWidth + columnGap;
    const usedHeight = rows * tileHeight + rowGap;
    const fitsViewport = usedWidth <= width + 1 && usedHeight <= height + 1;
    const fillRatio = Math.min(1, usedWidth / width) * 0.55 + Math.min(1, usedHeight / height) * 0.45;
    const areaScore = tileWidth * tileHeight;
    const visibleAreaScore = Math.min((areaScore * safeCount) / 100, 20_000);
    const overflowPenalty = fitsViewport ? 0 : Math.max(0, usedHeight - height) * 160;
    const fitBonus = fitsViewport ? 60_000 : safeCount <= 40 ? -60_000 : -14_000;
    const preferredPenalty = Math.abs(columns - preferredColumns) * preferredWeight;
    const preferredRows = Math.ceil(safeCount / preferredColumns);
    const rowBalancePenalty = Math.abs(rows - preferredRows) * 1_200;
    const lastRowPenalty = incompleteLastRowPenalty(safeCount, columns, rows);
    const score = fitBonus + areaScore + visibleAreaScore + fillRatio * 12_000
      - overflowPenalty - preferredPenalty - rowBalancePenalty - lastRowPenalty;

    if (!best || score > best.score) {
      best = {
        columns,
        rows,
        tileWidth: Math.max(1, tileWidth),
        tileHeight: Math.max(1, tileHeight),
        gap,
        density: densityForTileWidth(tileWidth),
        score,
      };
    }
  }

  const layout = best ?? {
    columns: 1,
    rows: safeCount,
    tileWidth: Math.min(maxTileWidth, width),
    tileHeight: Math.ceil(Math.min(maxTileWidth, width) / TILE_ASPECT),
    gap: GRID_GAP,
    density: densityForTileWidth(Math.min(maxTileWidth, width)),
    score: 0,
  };

  return {
    columns: layout.columns,
    rows: layout.rows,
    tileWidth: layout.tileWidth,
    tileHeight: layout.tileHeight,
    gap: layout.gap,
    density: layout.density,
  };
}
