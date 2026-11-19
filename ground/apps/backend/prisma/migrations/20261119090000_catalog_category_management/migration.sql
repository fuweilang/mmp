-- Preserve existing category keys and assignments; old enum types retained for compatibility.
CREATE TABLE "catalog_category_directory" ("kind" TEXT PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 0, CHECK (kind IN ('expert','skill')));
CREATE TABLE "catalog_category" ("kind" TEXT NOT NULL, "key" TEXT NOT NULL, "name" TEXT NOT NULL, "sort_order" INTEGER NOT NULL, PRIMARY KEY (kind,key), UNIQUE(kind,name), FOREIGN KEY(kind) REFERENCES catalog_category_directory(kind) ON DELETE RESTRICT);
INSERT INTO catalog_category_directory(kind) VALUES ('expert'), ('skill');
INSERT INTO catalog_category(kind,key,name,sort_order) VALUES
('expert','common','常用',0),
('expert','productivity','工作提效',1),
('expert','content','内容营销',2),
('expert','sales','销售增长',3),
('expert','expertise','专业知识',4),
('expert','analytics','数据分析',5),
('skill','common','效率工具',0),
('skill','content','内容创作',1),
('skill','analytics','数据分析',2),
('skill','office','办公协作',3),
('skill','education','知识学习',4),
('skill','expertise','开发设计',5),
('skill','business','运营增长',6),
('skill','ecommerce','电商经营',7),
('skill','sales','客户销售',8),
('skill','hr','人力行政',9),
('skill','legal','财税法务',10),
('skill','finance','金融投研',11),
('skill','consulting','企业咨询',12),
('skill','research','行业研究',13),
('skill','files','文件处理',14),
('skill','search','网页检索',15),
('skill','writing','翻译写作',16),
('skill','lifestyle','个人生活',17);
ALTER TABLE official_agent ALTER COLUMN category TYPE TEXT USING category::text;
ALTER TABLE official_agent ADD COLUMN category_kind TEXT NOT NULL DEFAULT 'expert' CHECK (category_kind = 'expert');
ALTER TABLE official_agent ADD CONSTRAINT official_agent_category_fkey FOREIGN KEY(category_kind,category) REFERENCES catalog_category(kind,key) ON DELETE RESTRICT;
ALTER TABLE official_skill ALTER COLUMN categories DROP DEFAULT;
ALTER TABLE official_skill ALTER COLUMN categories TYPE TEXT[] USING categories::text[];
ALTER TABLE official_skill ALTER COLUMN categories SET DEFAULT ARRAY[]::TEXT[];
-- Arrays cannot have foreign keys. Validate and lock referenced rows on every write,
-- including maintenance scripts, so concurrent category deletion cannot orphan assignments.
CREATE FUNCTION validate_skill_category_keys() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE category_key TEXT;
BEGIN
  IF cardinality(NEW.categories) > 3 THEN RAISE EXCEPTION '分类最多3个'; END IF;
  FOREACH category_key IN ARRAY NEW.categories LOOP
    PERFORM 1 FROM catalog_category WHERE kind='skill' AND key=category_key FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION '技能分类不存在: %', category_key; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER official_skill_category_keys BEFORE INSERT OR UPDATE OF categories ON official_skill FOR EACH ROW EXECUTE FUNCTION validate_skill_category_keys();
