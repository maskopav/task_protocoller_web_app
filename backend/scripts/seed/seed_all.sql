INSERT INTO roles (`name`, `description`) VALUES
('master', 'Full system control — can create, update, and delete all tables, manage projects, admins, and global settings. Only a few users should have this role.'),
('admin', 'Limited project-based control — can manage only assigned projects, their participants, and related data. Cannot see or modify other projects.');

INSERT INTO languages (`code`,`name`) VALUES
('en', 'english'),
('cs', 'czech'),
('de', 'german'),
('fr', 'french'),
('it', 'italian'),
('es', 'spanish');

INSERT INTO task_types (`type`) VALUES
('voice'),
('camera'),
('motoric'),
('questionnaire'),
('hearing'),
('vision'),
('cognitive');

INSERT INTO tasks (`category`, `type_id`, `recording_mode`, `params`, `illustration`)
VALUES
('phonation', 
 (SELECT id FROM task_types WHERE type='voice'),
 JSON_OBJECT('mode', 'delayedStop', 'duration', 10),
 JSON_ARRAY('phoneme', 'repeat', 'duration'),
 NULL
),
('syllableRepeating', 
 (SELECT id FROM task_types WHERE type='voice'),
 JSON_OBJECT('mode', 'countDown', 'duration', 8),
 JSON_ARRAY('syllable', 'repeat', 'duration'),
 NULL
),
('retelling',
 (SELECT id FROM task_types WHERE type='voice'),
 JSON_OBJECT('mode', 'basicStop'),
 JSON_ARRAY('fairytale', 'repeat'),
 NULL
),
('reading',
 (SELECT id FROM task_types WHERE type='voice'),
 JSON_OBJECT('mode', 'basicStop'),
 JSON_ARRAY('topic', 'repeat'),
 NULL
),
('monologue',
 (SELECT id FROM task_types WHERE type='voice'),
 JSON_OBJECT('mode', 'delayedStop', 'duration', 45),
 JSON_ARRAY('topic', 'repeat', 'duration'),
 NULL
),
('questionnaire',
 (SELECT id FROM task_types WHERE type='questionnaire'),
 NULL,
 NULL,
 NULL
);
