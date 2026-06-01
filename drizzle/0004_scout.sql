ALTER TABLE outings ADD COLUMN scouting_notes TEXT;

INSERT INTO sources (name, adapter, geographic_match_score, domain_specialty_score)
VALUES ('Scout', 'scout', 1, 1);
