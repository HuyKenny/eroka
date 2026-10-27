-- Rank Math robots of posts/pages (e.g. "index,noimageindex" on product reviews), printed 1:1.
ALTER TABLE posts ADD COLUMN seo_robots TEXT NOT NULL DEFAULT '';
