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

export interface SpeciesGroup {
  species?: string[];
  imageFigureId?: string;
  icon?: string;
}

export interface SpeciesTaxonomyNode {
  id?: string;
  icon?: string;
  englishTitle?: string;
  description?: string;
  imageFigureId?: string;
  categories?: Record<string, SpeciesTaxonomyNode>;
  groups?: string[];
  groupLabels?: Record<string, string>;
  species?: string[];
}

interface SpeciesConfig {
  groups?: Record<string, SpeciesGroup>;
  taxonomy?: Record<string, SpeciesTaxonomyNode>;
}

let config: SpeciesConfig | undefined;
let groupsBySpecies: Map<string, string[]> | undefined;

const loadSpeciesConfig = () => {
  if (!config) {
    const file = join(process.cwd(), "src", "data", "species.yaml");
    config = load(readFileSync(file, "utf8")) as SpeciesConfig;
    validateTaxonomy(config);
  }
  return config;
};

const validateTaxonomy = ({ groups = {}, taxonomy = {} }: SpeciesConfig) => {
  const validateNode = (node: SpeciesTaxonomyNode, path: string[]) => {
    for (const group of node.groups ?? []) {
      if (!groups[group]) {
        throw new Error(`species.yaml taxonomy references missing group "${group}" at "${path.join("/")}"`);
      }
    }
    for (const [name, child] of Object.entries(node.categories ?? {})) {
      validateNode(child, [...path, name]);
    }
  };

  for (const [name, node] of Object.entries(taxonomy)) validateNode(node, [name]);
};

export const getSpeciesGroups = () => loadSpeciesConfig().groups ?? {};

export const getSpeciesTaxonomy = () => loadSpeciesConfig().taxonomy ?? {};

export const getSpeciesTaxonomyPathSegment = (name: string) => name.replace(/\//g, "／");

export const getSpeciesTaxonomyGroups = (node: SpeciesTaxonomyNode): string[] => {
  const children = Object.values(node.categories ?? {}).flatMap(getSpeciesTaxonomyGroups);
  return Array.from(new Set([...(node.groups ?? []), ...children]));
};

const loadGroupsBySpecies = () => {
  const map = new Map<string, string[]>();
  for (const [group, value] of Object.entries(getSpeciesGroups())) {
    for (const name of value.species ?? []) {
      const groups = map.get(name) ?? [];
      if (!groups.includes(group)) groups.push(group);
      map.set(name, groups);
    }
  }
  return map;
};

const resolveEntries = (species: string, legacyGroup?: string): SpeciesEntry[] => {
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
