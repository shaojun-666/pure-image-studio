-- 形象可以不带参考图了：assetId 由 NOT NULL 放宽为可空。
-- 空 = 文字形象（只注入 description），非空 = 图片形象（额外带 subject 参考图）。
-- 放宽 NOT NULL 不改写表、不动任何已有数据；外键约束保持原样（ON DELETE CASCADE）。
ALTER TABLE "Character" ALTER COLUMN "assetId" DROP NOT NULL;
