export type MakerValue = string | string[] | undefined;

export const makerNames = (maker: MakerValue): string[] =>
  maker ? (Array.isArray(maker) ? maker : [maker]) : [];

export const makerBadgeClass = (maker: string) => {
  switch (maker) {
    case "海洋堂": return "maker-kaiyodo";
    case "バンダイ": return "maker-bandai";
    case "タカラトミー": return "maker-takaratomy";
    case "リーメント": return "maker-re-ment";
    case "奇譚クラブ": return "maker-kitan-club";
    default: return "maker-default";
  }
};
