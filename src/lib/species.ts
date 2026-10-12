export interface SpeciesEntry {
  species: string;
  speciesGroup: string;
}

interface SpeciesData {
  species?: string;
  speciesGroup?: string;
  speciesEntries?: SpeciesEntry[];
}

export const getSpeciesEntries = (data: SpeciesData): SpeciesEntry[] =>
  data.speciesEntries?.length
    ? data.speciesEntries
    : data.species
      ? [{ species: data.species, speciesGroup: data.speciesGroup ?? "分類未設定" }]
      : [];