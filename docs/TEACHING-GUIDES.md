# Structured teaching guides

A lesson can include an optional teacher-authored guide alongside its existing
text, source links and attachments. The guide makes a purpose, a model, a practice
task and an explanatory question visible to learners. Existing courses without
a guide keep their normal lesson view.

## Author a guide

In the course editor, choose **Add a teaching guide** within a lesson. Write:

| Field | Purpose | Maximum UTF-16 units |
| --- | --- | --- |
| Learning goal (`goal`) | What the learner should be able to explain or do | 500 |
| Familiar connection (`connection`) | A link to relevant prior knowledge; optional content | 2,000 |
| Worked example (`workedExample`) | A narrated example showing the important steps and reasons | 6,000 |
| Practice task (`practice`) | A manageable task or a different example to try | 2,000 |
| Check question (`checkQuestion`) | A question asking for an explanation or application | 2,000 |
| Explanation to compare (`checkExplanation`) | Reasoning the learner can reveal and compare | 6,000 |

Keep the main explanation, accessible description or transcript in **Lesson
text**. Material credits, rights, links and attachments retain their existing
roles. Guide fields are plain text. Publishing requires all instructional fields
except the familiar connection to contain non-whitespace content. Draft courses
can save partially written guides. A published course's editor publishes reviewed
changes; it does not create a separate saved draft revision of that course.
Turning the option off removes the guide from the edited lesson.

The exported `TeachingGuide`, `LESSON_GUIDE_LIMITS` and `validateTeachingGuide`
support other interfaces. `validateCourse` also checks publication completeness
and the existing 256-KiB serialized course limit. Unknown/missing guide keys,
non-string fields, prohibited controls and oversized values are rejected.
Validated snapshots are detached and frozen. There is no new runtime dependency.

## Learner privacy and feedback

The lesson displays the goal, connection, explanation, example, practice and
question as distinct sections. Learners can write an explanation, think or work
elsewhere, and choose **Show explanation** to compare the teacher's reasoning.
Viewing that explanation is optional and does not submit or grade a response.
Comparison text is normal course content available to authorized readers; it is
not a protected examination answer bank.

The response form stays in the mounted screen. The feature creates no answer,
grade, attendance or progress record, storage entry or background submission.
Existing draft protection asks before discarding typed work on normal navigation.
Identity, role, course revision and lesson changes reset the form and disclosure.
Learners can copy their own response elsewhere if they choose to keep it.

**Ask for help** uses the existing course-support form. It does not copy the
practice response, private vault or reading history. Only the message a learner
explicitly submits is shared with authorized staff. Study groups, scheduled
sessions and administrator-created private teacher rooms remain separate services.

## Database upgrade and compatibility

Fresh installations use `examples/postgres/course-portal-schema.sql`.
Existing installations review and rehearse
`examples/postgres/upgrade-lesson-guides.sql` on a backup first. Run it as the
existing private portal function owner. The migration checks that ownership,
creates the bounded private guide validator and replaces existing validation/save
functions transactionally. It preserves records, revisions, RLS, function owners
and existing grants. It adds no table, public RPC or learner-state storage.

Update both server validation and reading clients before authoring guide-enabled
courses. Earlier strict clients reject an unfamiliar `teaching` key. Existing
guide-free records remain valid; the upgrade does not rewrite them. Account,
membership, draft visibility, media ownership and revision-conflict checks remain
authoritative. No live database is changed by building or testing this repository.

## Instructional design and validation

The design draws on the [IES instruction and study guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/1),
[AERO explicit-instruction guidance](https://www.edresearch.edu.au/guides-resources/practice-guides/explicit-instruction-practice-guide-full-publication)
and [CAST UDL Guidelines](https://udlguidelines.cast.org/). They support making
goals and connections clear, modelling, practice and explanatory questions.
They do not validate this application's effectiveness for every learner or age.
Adjust examples, language, supports and ways of responding to the subject and
learners. Avoid timers, fixed ability labels or completion clicks as evidence of
understanding. Teachers remain responsible for content accuracy and useful feedback.

Technical tests cover validation/permissions, migration preservation, authoring,
private response handling, escaped text, keyboard use, reflow and automated
accessibility. Educational validation additionally needs representative learners
and teachers, a different application task, later recall/transfer and content
review. Passing software tests is not evidence of subject mastery or a complete
accessibility review. Keyed screen reset follows [React's state model](https://react.dev/learn/preserving-and-resetting-state);
optional explanation disclosure uses the native [HTML details element](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-details-element).
