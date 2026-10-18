PRAGMA foreign_keys = ON;  -- SQLite only enforces foreign keys after this line

-- 1. Tables


CREATE TABLE students (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE            -- no two students share an email
);

CREATE TABLE courses (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL DEFAULT 3
);

-- The join table: one row = one student enrolled on one course
CREATE TABLE enrolments (
  student_id INTEGER NOT NULL,
  course_id  INTEGER NOT NULL,
  grade      INTEGER CHECK (grade BETWEEN 0 AND 100),   -- empty until graded
  PRIMARY KEY (student_id, course_id),                  -- the same student cannot enrol on the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

-- An index for looking up enrolments by course (see school-design.md)
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);


-- 2. Sample data: 4 students, 3 courses, 6 enrolments


INSERT INTO students (name, email) VALUES
  ('Phy Simsons',  'phy@example.com'),
  ('Karen Kai',   'karen@example.com'),
  ('Grace Walters', 'grace@example.com'),
  ('David King',  'david@example.com');     -- David has no enrolments yet

INSERT INTO courses (title, credits) VALUES
  ('Architecture',    3),
  ('Python Programming', 4),
  ('Mechanical Engineering',       4);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 78),     -- Phy    -> Architecture
  (1, 2, NULL),   -- Phy    -> Python Programming (not graded yet)
  (2, 1, 64),     -- Karen    -> Architecture
  (2, 3, 71),     -- Karen    -> Mechanical Engineering
  (3, 1, 90),     -- Grace    -> Architecture
  (3, 2, 55);     -- Grace    -> Python Programming


-- 3. Queries


-- Query 1: all courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses    ON courses.id = enrolments.course_id
WHERE students.name = 'Phy Simsons';

-- Query 2: all students on one course
SELECT students.name, enrolments.grade
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students   ON students.id = enrolments.student_id
WHERE courses.title = 'Architecture';

-- Query 3: the number of students per course
-- (LEFT JOIN keeps a course even if nobody has enrolled on it)
SELECT courses.title, COUNT(enrolments.student_id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;

-- Query 4: students who have no enrolments
-- (LEFT JOIN keeps every student; students with no match have NULL in enrolments)
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.student_id IS NULL;

-- Query 5: update one enrolment's grade (always use WHERE!)
-- Phy's Python Programming grade was empty; set it to 85.
UPDATE enrolments
SET grade = 85
WHERE student_id = 1 AND course_id = 2;

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses  ON courses.id  = enrolments.course_id
WHERE enrolments.student_id = 1 AND enrolments.course_id = 2;