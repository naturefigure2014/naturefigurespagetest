import { getCollection as getAstroCollection, type CollectionEntry, type CollectionKey } from "astro:content";
import { sortContentById } from "./content-order.mjs";

export async function getSortedCollection<C extends CollectionKey>(collection: C): Promise<CollectionEntry<C>[]> {
  return sortContentById(await getAstroCollection(collection));
}
