# School Database Design

A small relational database for a school. It records **students**, **courses**, and which students are **enrolled** on which courses, with a grade for each enrolment.

## Tables

### `students`

One row per student.

- `id`: the primary key, a number the database assigns
- `name`: the student's name (`NOT NULL`, so every student has one)
- `email`: the student's email (`NOT NULL UNIQUE`, so no two students share an email)

### `courses`

One row per course.

- `id`: the primary key
- `title`: the course name (`NOT NULL UNIQUE`, so the same course is not stored twice)
- `credits`: how many credits the course is worth (`NOT NULL`, default 3)

### `enrolments`

One row for each time a student is enrolled on a course. It links the other two tables and holds the grade.

- `student_id`: a foreign key that points to `students.id`
- `course_id`: a foreign key that points to `courses.id`
- `grade`: the mark from 0 to 100, which stays empty (`NULL`) until the work is graded. A `CHECK` rule stops values outside that range.
- The primary key is the **pair** `(student_id, course_id)`.

Both foreign keys use `ON DELETE CASCADE`, so if a student or a course is deleted, their enrolments are removed too and no orphan rows are left behind.

## Relationships

- **One student, many enrolments** (one-to-many): a student can enrol on several courses, so one row in `students` matches many rows in `enrolments`.
- **One course, many enrolments** (one-to-many): a course has several students, so one row in `courses` matches many rows in `enrolments`.
- **Students and courses are many-to-many.** A student takes many courses, and a course has many students.

A many-to-many relationship needs a **join table** because a column can hold only one value. We cannot put a list of course ids in a `courses` column on `students`, because that would be hard to search, update and check. The `enrolments` table solves this by storing **one row for each pair** of student and course. It is also the right place to keep facts that belong to the pair itself, such as the grade, because a grade is not a property of the student alone or of the course alone.

The composite primary key `(student_id, course_id)` also gives us the rule that **the same student cannot enrol on the same course twice**. The database rejects a second row with the same pair.

## Index

```sql
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);
```

**Reason:** the primary key `(student_id, course_id)` already makes lookups by student fast, because `student_id` comes first. It does not help when we search by `course_id` alone. Two of our queries do exactly that: "all students on one course" and "the number of students per course". Without this index, the database would read every enrolment row to find one course's students. With the index it jumps straight to them. The trade-off is that writes become slightly slower and the index uses extra space, which is small for a table this size.

## SQL or NoSQL?

I would choose **SQL** (a relational database such as PostgreSQL or SQLite) for this system. The data is clearly structured, with students, courses and enrolments that always have the same fields, and the relationships between them matter most. We need a many-to-many link, a unique email, and a rule that no student is enrolled twice, and a relational database enforces all of these itself with foreign keys, `UNIQUE` and primary keys, so the data stays correct even if the application code has a bug. School records such as grades also need to be accurate, which suits a system that is strict about its rules. A document database like MongoDB would let us store each student's courses inside one document, but then course details would be repeated across many students and could become inconsistent, and counting students per course would be harder. NoSQL would make more sense only if the data became very flexible or the system needed to spread across many servers, and a school database does not need either.
