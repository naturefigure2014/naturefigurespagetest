import { defineCollection, z } from "astro:content";

const common = {
  title: z.string(),
  description: z.preprocess(
    (value) => value === null ? undefined : value,
    z.string().optional()
  ),
  date: z.coerce.date().optional(),
  tags: z.array(z.string()).default([])
};

const figures = defineCollection({
  type: "content",
  schema: z.object({
    ...common,
    contentType: z.enum(["figure", "title"]).default("figure"),
    kind: z.enum(["series", "single", "collection", "product"]).optional(),
    // titleId is the full TITLE content id, e.g.
    // kaiyodo/capsuleq/nihon-no-doubutsu-1
    titleId: z.string().optional(),
    // This is the stable lineup/figure ID inside a TITLE: 001, 002, ...
    figureId: z.string().optional(),
    maker: z.string().optional(),
    sculptor: z.string().optional(),
    executiveProducer: z.string().optional(),
    series: z.array(z.string()).default([]),
    seriesName: z.union([z.string(), z.array(z.string())]).optional(),
    releaseStart: z.string().optional(),
    figureIds: z.array(z.string()).default([]),
    collectionImage: z.union([z.string(), z.number()]).optional(),
    // 個別フィギュアページ専用の集合写真（collectionImageより小さく表示）
    figureTopImage: z.union([z.string(), z.number()]).optional(),
    resources: z.object({
      guide: z.object({
        image: z.union([z.string(), z.number()]).optional(),
        description: z.string().optional()
      }).optional(),
      displayPop: z.object({
        image: z.union([z.string(), z.number()]).optional(),
        description: z.string().optional()
      }).optional(),
      capsule: z.object({
        image: z.union([z.string(), z.number()]).optional(),
        description: z.string().optional()
      }).optional(),
      salesLocation: z.object({
        image: z.union([z.string(), z.number()]).optional(),
        description: z.string().optional()
      }).optional()
    }).default({}),
    relatedPostEmbed: z.string().optional(),
    species: z.string().optional(),
    speciesGroup: z.string().optional(),
    scientificName: z.string().optional(),
    releaseDate: z.coerce.date().optional(),
    size: z.string().optional(),
    price: z.string().optional(),
    // 画像は 1 / "001" / "001.jpg" / "/figures/.../001.jpg" のいずれでも指定可能。
    coverImage: z.union([z.string(), z.number()]).optional(),
    workIds: z.array(z.string()).default([]),
    topics: z.array(z.object({
      title: z.string(),
      images: z.array(z.union([z.string(), z.number()])).default([]),
      comment: z.string().optional()
    })).default([])
  })
});

const works = defineCollection({
  type: "content",
  schema: z.object({
    ...common,
    type: z.enum(["painting", "custom", "diorama", "modification"]),
    originalFigure: z.string().optional(),
    workDate: z.coerce.date().optional(),
    images: z.array(z.string()).default([])
  })
});

const blog = defineCollection({
  type: "content",
  schema: z.object({
    ...common,
    category: z.enum(["diary", "event", "outing", "note"]).default("note"),
    relatedTitles: z.array(z.string()).default([]),
    relatedFigures: z.array(z.string()).default([]),
    relatedWorks: z.array(z.string()).default([]),
    coverImage: z.string().optional()
  })
});

export const collections = { figures, works, blog };
