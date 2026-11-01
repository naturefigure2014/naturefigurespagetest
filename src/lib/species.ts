import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

export const UNCLASSIFIED_GROUP = "分類未設定";

export interface SpeciesEntry {
  species: string;
  speciesGroup: string;
}

interface SpeciesData {
  species?: string;
  speciesGroup?: string;
  speciesEntries?: { species: string; speciesGroup?: string }[];
}

let groupsBySpecies: Map<string, string[]> | undefined;

const loadGroupsBySpecies = () => {
  const map = new Map<string, string[]>();
  const file = join(process.cwd(), "src", "data", "species.yaml");
  const parsed = load(readFileSync(file, "utf8")) as { groups?: Record<string, { species?: string[] }> } | undefined;
  for (const [group, value] of Object.entries(parsed?.groups ?? {})) {
    for (const name of value?.species ?? []) {
      const groups = map.get(name) ?? [];
      if (!groups.includes(group)) groups.push(group);
      map.set(name, groups);
    }
  }
  return map;
};

const resolveEntries = (species: string, legacyGroup?: string): SpeciesEntry[] => {
  // "-" は生き物ではないフィギュアの印なので、従来どおり扱う
  if (species === "-") return [{ species, speciesGroup: legacyGroup ?? UNCLASSIFIED_GROUP }];
  groupsBySpecies ??= loadGroupsBySpecies();
  const groups = groupsBySpecies.get(species);
  return (groups?.length ? groups : [UNCLASSIFIED_GROUP]).map((speciesGroup) => ({ species, speciesGroup }));
};

export const getSpeciesEntries = (data: SpeciesData): SpeciesEntry[] =>
  data.speciesEntries?.length
    ? data.speciesEntries.flatMap((entry) => resolveEntries(entry.species, entry.speciesGroup))
    : data.species
      ? resolveEntries(data.species, data.speciesGroup)
      : [];
