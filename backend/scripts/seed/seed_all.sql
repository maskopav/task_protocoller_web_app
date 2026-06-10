INSERT INTO roles (`name`, `description`) VALUES
('master', 'Full system control — can create, update, and delete all tables, manage projects, admins, and global settings. Only a few users should have this role.'),
('admin', 'Limited project-based control — can manage only assigned projects, their participants, and related data. Cannot see or modify other projects.');

INSERT INTO languages (`code`,`name`, `native_name`) VALUES
('en', 'english', 'English'),
('cs', 'czech', 'Čeština'),
('de', 'german', 'Deutsch'),
('fr', 'french', 'Français'),
('it', 'italian', 'Italiano'),
('es', 'spanish', 'Español');

INSERT INTO task_types (`type`) VALUES
('voice'),
('camera'),
('motoric'),
('questionnaire'),
('hearing'),
('vision'),
('cognitive');

INSERT INTO tasks (`category`, `type_id`)
VALUES
('phonation', 
 (SELECT id FROM task_types WHERE type='voice')
),
('syllableRepeating', 
 (SELECT id FROM task_types WHERE type='voice')
),
('retelling',
 (SELECT id FROM task_types WHERE type='voice')
),
('reading',
 (SELECT id FROM task_types WHERE type='voice')
),
('monologue',
 (SELECT id FROM task_types WHERE type='voice')
),
('questionnaire',
 (SELECT id FROM task_types WHERE type='questionnaire')
),
('d15colour',
 (SELECT id FROM task_types WHERE type='vision')
),
('dynamic_monologue',
 (SELECT id FROM task_types WHERE type='voice')
),
('sdmt',
 (SELECT id FROM task_types WHERE type='cognitive')
);
