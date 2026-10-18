ALTER TABLE preferences ADD COLUMN juxtaposition INTEGER NOT NULL DEFAULT 2 CONSTRAINT preferences_juxtaposition CHECK (typeof(juxtaposition) = 'integer' AND juxtaposition BETWEEN 0 AND 4);
ALTER TABLE preferences ADD COLUMN cut_strength INTEGER NOT NULL DEFAULT 2 CONSTRAINT preferences_cut_strength CHECK (typeof(cut_strength) = 'integer' AND cut_strength BETWEEN 0 AND 4);
ALTER TABLE preferences ADD COLUMN ambiguity INTEGER NOT NULL DEFAULT 2 CONSTRAINT preferences_ambiguity CHECK (typeof(ambiguity) = 'integer' AND ambiguity BETWEEN 0 AND 4);
ALTER TABLE preferences ADD COLUMN concreteness INTEGER NOT NULL DEFAULT 3 CONSTRAINT preferences_concreteness CHECK (typeof(concreteness) = 'integer' AND concreteness BETWEEN 0 AND 4);
