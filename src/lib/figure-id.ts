export const formatFigureId = (figureId?: string) =>
  figureId?.replace(/^0+(?=\d)/, "");