import type { HistoryGallerySort, HistoryItem } from "../../types/domain";

export function sortHistoryGalleryItems(items: HistoryItem[], sort: HistoryGallerySort): HistoryItem[] {
  const direction = sort === "oldest" ? 1 : -1;
  return [...items].sort((a, b) => {
    const aCreatedAt = Number.isFinite(Number(a.createdAt)) ? Number(a.createdAt) : 0;
    const bCreatedAt = Number.isFinite(Number(b.createdAt)) ? Number(b.createdAt) : 0;
    return (aCreatedAt - bCreatedAt) * direction;
  });
}
