-- Mock data for dox.db. Idempotent-ish: only inserts rows whose IDs start with
-- `01MOCK`; rerunning would error on PK collision (intentional — manual reset
-- via DELETE … WHERE id LIKE '01MOCK%').
--
-- Owner is auto-discovered: we assume there's exactly one user with role=owner
-- and bind everything to them.

BEGIN;

-- Capture the owner id once.
CREATE TEMP TABLE _owner AS SELECT id FROM users WHERE role = 'owner' LIMIT 1;

-- ── projects ──────────────────────────────────────────────────────────────
INSERT INTO projects (id, owner_id, name, description, color, archived, sort_order, created_at, updated_at)
SELECT 'PROJ01WORK0000000000000000', id, 'Work',     'Day-job tasks',          'blue',    0, 0, unixepoch('now','-30 days')*1000, unixepoch('now','-30 days')*1000 FROM _owner UNION ALL
SELECT 'PROJ02PERSONAL000000000000', id, 'Personal', 'Life admin & errands',   'green',   0, 1, unixepoch('now','-25 days')*1000, unixepoch('now','-25 days')*1000 FROM _owner UNION ALL
SELECT 'PROJ03SIDE0000000000000000', id, 'Side',     'Hobby projects & misc.', 'magenta', 0, 2, unixepoch('now','-20 days')*1000, unixepoch('now','-20 days')*1000 FROM _owner;

-- ── todos ─────────────────────────────────────────────────────────────────
-- Distributed across the last 14 days. `done=1` rows have updated_at later
-- than created_at to simulate "closed N days after open". `project_id` mixes
-- inbox (NULL) with the 3 mock projects so filters all have data.

INSERT INTO todos (id, title, done, project_id, created_by, created_at, updated_at)
SELECT 'TODO01MOCK000000000000000A', 'Buy groceries',             0, NULL,                          id, unixepoch('now','-1 hours')*1000,  unixepoch('now','-30 minutes')*1000 FROM _owner UNION ALL
SELECT 'TODO02MOCK000000000000000B', 'Call mom',                  0, NULL,                          id, unixepoch('now','-2 hours')*1000,  unixepoch('now','-2 hours')*1000     FROM _owner UNION ALL
SELECT 'TODO03MOCK000000000000000C', 'Review PR #142',            0, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-4 hours')*1000,  unixepoch('now','-1 hours')*1000     FROM _owner UNION ALL
SELECT 'TODO04MOCK000000000000000D', 'Ship dox 0.1 alpha',        1, 'PROJ03SIDE0000000000000000',  id, unixepoch('now','-8 hours')*1000,  unixepoch('now','-2 hours')*1000     FROM _owner UNION ALL
SELECT 'TODO05MOCK000000000000000E', 'Pay rent',                  1, NULL,                          id, unixepoch('now','-1 days')*1000,   unixepoch('now','-12 hours')*1000    FROM _owner UNION ALL
SELECT 'TODO06MOCK000000000000000F', 'Draft Q3 OKRs',             0, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-1 days')*1000,   unixepoch('now','-1 days')*1000      FROM _owner UNION ALL
SELECT 'TODO07MOCK000000000000000G', 'Book flight to SF',         1, 'PROJ02PERSONAL000000000000', id, unixepoch('now','-2 days')*1000,   unixepoch('now','-1 days')*1000      FROM _owner UNION ALL
SELECT 'TODO08MOCK000000000000000H', 'Renew passport',            0, 'PROJ02PERSONAL000000000000', id, unixepoch('now','-2 days')*1000,   unixepoch('now','-2 days')*1000      FROM _owner UNION ALL
SELECT 'TODO09MOCK000000000000000I', 'Reply to recruiter email',  1, NULL,                          id, unixepoch('now','-2 days')*1000,   unixepoch('now','-2 days')*1000      FROM _owner UNION ALL
SELECT 'TODO10MOCK000000000000000J', 'Refactor authn middleware', 1, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-3 days')*1000,   unixepoch('now','-2 days')*1000      FROM _owner UNION ALL
SELECT 'TODO11MOCK000000000000000K', 'Read Designing Data-Intensive Apps ch.4', 0, 'PROJ03SIDE0000000000000000', id, unixepoch('now','-3 days')*1000, unixepoch('now','-3 days')*1000 FROM _owner UNION ALL
SELECT 'TODO12MOCK000000000000000L', 'Replace kitchen lightbulb', 1, NULL,                          id, unixepoch('now','-3 days')*1000,   unixepoch('now','-3 days')*1000      FROM _owner UNION ALL
SELECT 'TODO13MOCK000000000000000M', 'Schedule dentist appt',     1, 'PROJ02PERSONAL000000000000', id, unixepoch('now','-4 days')*1000,   unixepoch('now','-3 days')*1000      FROM _owner UNION ALL
SELECT 'TODO14MOCK000000000000000N', 'Onboarding doc rev2',       0, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-4 days')*1000,   unixepoch('now','-4 days')*1000      FROM _owner UNION ALL
SELECT 'TODO15MOCK000000000000000O', 'Migrate sqlc to v2',        0, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-5 days')*1000,   unixepoch('now','-5 days')*1000      FROM _owner UNION ALL
SELECT 'TODO16MOCK000000000000000P', 'Clean garage',              0, NULL,                          id, unixepoch('now','-5 days')*1000,   unixepoch('now','-5 days')*1000      FROM _owner UNION ALL
SELECT 'TODO17MOCK000000000000000Q', 'Try out new keyboard',      1, 'PROJ03SIDE0000000000000000',  id, unixepoch('now','-5 days')*1000,   unixepoch('now','-4 days')*1000      FROM _owner UNION ALL
SELECT 'TODO18MOCK000000000000000R', 'Update CV',                 0, 'PROJ02PERSONAL000000000000', id, unixepoch('now','-6 days')*1000,   unixepoch('now','-6 days')*1000      FROM _owner UNION ALL
SELECT 'TODO19MOCK000000000000000S', 'Write blog: dox internals', 0, 'PROJ03SIDE0000000000000000',  id, unixepoch('now','-7 days')*1000,   unixepoch('now','-7 days')*1000      FROM _owner UNION ALL
SELECT 'TODO20MOCK000000000000000T', 'Tidy ~/Downloads',          1, NULL,                          id, unixepoch('now','-7 days')*1000,   unixepoch('now','-6 days')*1000      FROM _owner UNION ALL
SELECT 'TODO21MOCK000000000000000U', 'Push grpc-gateway tests',   1, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-8 days')*1000,   unixepoch('now','-7 days')*1000      FROM _owner UNION ALL
SELECT 'TODO22MOCK000000000000000V', 'Cancel old subscriptions',  0, 'PROJ02PERSONAL000000000000', id, unixepoch('now','-9 days')*1000,   unixepoch('now','-9 days')*1000      FROM _owner UNION ALL
SELECT 'TODO23MOCK000000000000000W', 'Setup CI for proto codegen',1, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-9 days')*1000,   unixepoch('now','-8 days')*1000      FROM _owner UNION ALL
SELECT 'TODO24MOCK000000000000000X', 'Build dox status bar plug', 0, 'PROJ03SIDE0000000000000000',  id, unixepoch('now','-10 days')*1000,  unixepoch('now','-10 days')*1000     FROM _owner UNION ALL
SELECT 'TODO25MOCK000000000000000Y', 'File 2025 taxes',           1, 'PROJ02PERSONAL000000000000', id, unixepoch('now','-11 days')*1000,  unixepoch('now','-10 days')*1000     FROM _owner UNION ALL
SELECT 'TODO26MOCK000000000000000Z', 'Audit AGPL deps',           0, 'PROJ01WORK0000000000000000',  id, unixepoch('now','-12 days')*1000,  unixepoch('now','-12 days')*1000     FROM _owner UNION ALL
SELECT 'TODO27MOCK0000000000000010', 'Plan birthday dinner',      0, NULL,                          id, unixepoch('now','-12 days')*1000,  unixepoch('now','-12 days')*1000     FROM _owner UNION ALL
SELECT 'TODO28MOCK0000000000000011', 'Backup laptop to NAS',      1, NULL,                          id, unixepoch('now','-13 days')*1000,  unixepoch('now','-12 days')*1000     FROM _owner UNION ALL
SELECT 'TODO29MOCK0000000000000012', 'Sketch v0.2 roadmap',       0, 'PROJ03SIDE0000000000000000',  id, unixepoch('now','-13 days')*1000,  unixepoch('now','-13 days')*1000     FROM _owner UNION ALL
SELECT 'TODO30MOCK0000000000000013', 'Watch Linux Plumbers talk', 1, NULL,                          id, unixepoch('now','-13 days')*1000,  unixepoch('now','-11 days')*1000     FROM _owner;

DROP TABLE _owner;
COMMIT;
