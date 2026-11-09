import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

export interface ThemeGroup {
  name: string;
  subgroups: string[];
}

let groups: ThemeGroup[] | undefined;

export const getThemeGroups = (): ThemeGroup[] => {
  if (!groups) {
    const file = join(process.cwd(), "src", "data", "themes.yaml");
    const parsed = load(readFileSync(file, "utf8")) as
      | { groups?: Record<string, { subgroups?: string[] }> }
      | undefined;
    groups = Object.entries(parsed?.groups ?? {}).map(([name, value]) => ({
      name,
      subgroups: value?.subgroups ?? []
    }));
  }
  return groups;
};

export const getThemeGroupOf = (subgroup: string) =>
  getThemeGroups().find((group) => group.subgroups.includes(subgroup));
