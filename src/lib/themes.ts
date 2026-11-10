import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

export interface ThemeNode {
  name: string;
  children: string[];
}

export interface ThemeGroup {
  name: string;
  subgroups: ThemeNode[];
}

type RawNode = string | { name: string; children?: string[] };

let groups: ThemeGroup[] | undefined;

export const getThemeGroups = (): ThemeGroup[] => {
  if (!groups) {
    const file = join(process.cwd(), "src", "data", "themes.yaml");
    const parsed = load(readFileSync(file, "utf8")) as
      | { groups?: Record<string, { subgroups?: RawNode[] }> }
      | undefined;
    groups = Object.entries(parsed?.groups ?? {}).map(([name, value]) => ({
      name,
      subgroups: (value?.subgroups ?? []).map((node) =>
        typeof node === "string"
          ? { name: node, children: [] }
          : { name: node.name, children: node.children ?? [] }
      )
    }));
  }
  return groups;
};

// テーマ名はサイト全体で一意にすること（URL とフィギュアの themes 指定が名前のみのため）。
export const getThemeNodeOf = (theme: string) =>
  getThemeGroups()
    .flatMap((group) => group.subgroups)
    .find((node) => node.name === theme || node.children.includes(theme));

export const getThemeGroupOf = (theme: string) =>
  getThemeGroups().find((group) =>
    group.subgroups.some((node) => node.name === theme || node.children.includes(theme))
  );
