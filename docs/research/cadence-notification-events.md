# Which events in Cadence could trigger a notification?

Research for issue #3, a child of the in-app notifications map (#2). The source is the codebase only, read at commit `979e285` on `main`. Vocabulary follows `GLOSSARY.md`.

## Answer in brief

- Cadence has **no notification code today**. The only outbound messages are two Postmark emails, both about Refund Requests and both sent to the buyer: raised (`app/routes/courses.$slug.refund.ts:75`) and decided (`app/routes/admin.refunds.tsx:130`). Both go through `sendEmail` in `app/lib/mailer.server.ts`, which writes to `.outbox/` instead of calling Postmark when `POSTMARK_SERVER_TOKEN` is unset.
- The code holds **16 candidate events**. The strongest are a Student's question on a lesson (an Instructor has to answer it), an Open Refund Request (a Platform Admin has to decide it, and nobody is told today), a Seat claimed (a Team Admin would want to know), and the Refund Request decision (already emailed, so an in-app copy would double up).
- **Team Admin is not a `users.role`.** `UserRole` has three values: `student`, `instructor`, `admin` (`app/db/schema.ts:11-15`). A Team Admin is a Student with a `team_members` row whose `role` is `admin` (`schema.ts:40-43`, `266-278`). Platform Admin is `users.role = 'admin'`. The recipient lookups below reflect that.
- Several things the ticket names **do not exist as events in code**: lesson publishing, course completion, a Refund that is issued or failed, a Team Licence invite. See "Gaps".
- Frequencies are my estimates from the shape of each flow. The repo holds no production data.

## How recipients are found

| Role | How to find the user ids |
| --- | --- |
| Student | `enrollments` rows for a course (`enrollments.courseId`), the actor themselves, or `comments.userId` of a parent comment |
| Instructor | `courses.instructorId`. From a lesson: `lessons.moduleId -> modules.courseId -> courses.instructorId`, the join in `getCourseForLesson` (`app/routes/instructor.questions.tsx:103`) |
| Platform Admin | `users` where `role = 'admin'`. Admins count as staff on every course (`isStaff`, `app/lib/access.server.ts:99`) and see every course's question queue (`instructor.questions.tsx:173-176`) |
| Team Admin | The purchaser of a Team Licence, `purchases.userId`. Or `team_members` where `role = 'admin'` for `coupons.teamId`. A team has exactly one `admin` row today, written by `getOrCreateTeamForUser` (`app/routes/courses.$slug.purchase.tsx:208-220`). Nothing ever writes `TeamMemberRole.Member`. |

## Event inventory

"Email today" means a Postmark email that already goes out. Line numbers are as at `979e285`.

### Purchases, Enrollments, Seats, Team Licences

| # | Event | Where the state change happens | Caused by | Affects | Frequency | Email today |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Individual Purchase made, Enrollment created** | `app/routes/courses.$slug.purchase.tsx`, action `confirm-purchase`: `createPurchase` (call at 370, insert at 187), then `enrollUser` (call at 371, insert at 168). | Student | Student (confirmation). Instructor (a new Student on their course; counts show in `instructor.$courseId.tsx` and `instructor.analytics.tsx`). Platform Admin (revenue; optional). | Medium. One per sale, the main revenue event. | No. `enrollUser` has a `sendEmail` flag and an empty branch, `// Would send welcome email here` (173-175). The only call passes `false` (371). |
| 2 | **Team Licence purchased, Seats created** | Same action, `confirm-team-purchase` (376-379): `createTeamPurchase` (245-257) inserts the Purchase, `getOrCreateTeamForUser` creates the team and its admin row on first use (208-220), `generateCoupons` inserts one `coupons` row (a Seat) per unit (223-243). The buyer gets no Enrollment. | Student who becomes the Team Admin | Team Admin (the redeem links appear only on `/team`). Instructor (a sale, but no Enrollments yet). Platform Admin (optional). | Low. Rarer than individual sales and larger in value. | No. |
| 3 | **Seat claimed, Enrollment created** | `app/routes/redeem.$code.tsx`, `redeemCoupon`: updates `coupons.redeemedByUserId` and `redeemedAt` (98-105), inserts the Enrollment (106-111). Called from the action at 185. Refused when the Seat is on hold or refunded (`getSeatAvailability`, `app/lib/refunds.server.ts:111`), when the Student is already enrolled, or on a country mismatch. | Student (the claimer) | Team Admin (a Seat was used; `team.tsx` already shows `redeemedByEmail`). Student (own confirmation). Instructor (a new Student). Team Admin recipient: `coupons.purchaseId -> purchases.userId`. | Medium. Up to one per Seat, so bursty after a Team Licence is shared. | No. |
| 4 | **Individual Enrollment removed by an approved Refund Request** | `approveRefundRequest` (`refunds.server.ts:614`) deletes the Enrollment at 658, unless the Student also holds a Claimed Seat for the course (docs/adr/0004). Progress stays (docs/adr/0001), so the Student shows as **Lapsed** on the roster (`app/lib/enrollments.ts`, `instructor.$courseId.students.tsx:77,299`). | Platform Admin | Student (loses access; part of the decision in event 8). Instructor (roster change, the Student turns Lapsed). | Low. | Student only, through the decision email (event 8). |
| 5 | **Team Licence Unclaimed Seats voided** | `approveRefundRequest` for a Team Licence sets `coupons.refundedAt` on every Unclaimed Seat (638-646). Refused when any Seat is claimed (docs/adr/0003). | Platform Admin | Team Admin (the buyer). Anyone holding an unclaimed redeem link will see "no longer available" (`redeem.$code.tsx:40,66`), but Cadence cannot find them, because a Seat has no holder until it is claimed. | Very low. | Team Admin only, through the decision email (event 8). |

### Refund Requests and Refunds

| # | Event | Where | Caused by | Affects | Frequency | Email today |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | **Refund Request raised (Open)** | `raiseRefundRequest` (`refunds.server.ts:357`) inserts the `refunds` row with status `open` (380). Route: `app/routes/courses.$slug.refund.ts:32-76`. Only the buyer may raise it, inside the 14-day window (`app/lib/refund-rules.ts`), and only one can be open per Purchase. | Student, or Team Admin for a Team Licence | **Platform Admin**: the request waits in the `/admin/refunds` queue (`admin.refunds.tsx:83-92`, `listRefundRequestsForReview`, oldest first) and no one is told it exists. Buyer (acknowledgement). | Low to medium, a small share of sales. | Buyer only: "Refund requested" (`refunds.server.ts:396`, sent at `refund.ts:75`). **No Platform Admin email.** |
| 7 | **Seats put on hold by an Open Team Licence request** | Derived, not stored. `getSeatAvailability` returns `on_hold` while an open request exists (`refunds.server.ts:111-122`). It changes as a side effect of event 6. | Team Admin | Team Admin (their own request). Seat holders cannot claim until it is decided, and cannot be found (see event 5). | Very low. | No. |
| 8 | **Refund Request approved or declined** | `approveRefundRequest` (669-677) and `declineRefundRequest` (692-730) set `refunds.status`, `resolvedAt`, `resolvedByUserId`, `decisionNote`. Route: `admin.refunds.tsx:94-142`. The first decision wins; a second Platform Admin gets a 409 (`findOpenRefundRequest`). | Platform Admin | **Buyer**: Student, or Team Admin for a Team Licence. | Low, one per Refund Request. | **Yes.** `buildDecisionEmail` (`refunds.server.ts:736`), sent at `admin.refunds.tsx:130`. Subject "Refund approved" or "Refund declined", with the note. |

### Comments and questions

A "question" in Cadence is a top-level comment (`comments.parentId IS NULL`) by someone who is neither the owning Instructor nor an admin. Replies go one level deep (`schema.ts:339-345`). Only Students with content access, or staff, can post (`requireContentAccess`, lesson route action at 895).

| # | Event | Where | Caused by | Affects | Frequency | Email today |
| --- | --- | --- | --- | --- | --- | --- |
| 9 | **Question asked** (top-level comment by a Student) | Lesson route `createComment` (`app/routes/courses.$slug.lessons.$lessonId.tsx:404-431`, insert at 431), called from the action `create-comment` (903). | Student | **Instructor** of the course: they answer from `/instructor/questions`, which lists unanswered questions and marks those older than 3 days (`instructor.questions.tsx:42-90`, `STALE_AFTER_DAYS`). Platform Admins also see every course's queue (`isAdmin` in the loader), so notifying all admins would be noisy. | Medium to high. The most frequent human-generated event. | No. |
| 10 | **Reply posted by staff** (an answer) | `instructor.questions.tsx` action (188-225): `createComment` (insert at 153) with `parentId` set, after `requireStaff`. An Instructor or admin can also reply inline on the lesson page. | Instructor or Platform Admin | **Student** who asked: the parent's author, `comments.parentId -> comments.userId`. | Medium. Roughly one per question. | No. |
| 11 | **Reply posted by another Student** | Same lesson-route `createComment`, with `parentId` set and a non-staff author. | Student | The parent comment's author (Student). The Instructor is already covered by event 9 if the thread is unanswered. | Low to medium. | No. |
| 12 | **Comment edited or deleted** | `updateComment` sets `editedAt` (437-457). `deleteComment` sets `deletedAt`, a soft delete (459-477). Staff may delete anyone's comment. | Student, Instructor, or Platform Admin | A weak case. A staff delete of a Student's comment would affect that Student; an edit affects no one. | Low. | No. |

### Ratings

| # | Event | Where | Caused by | Affects | Frequency | Email today |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | **Course rated or re-rated** | `rateCourse` in `app/routes/courses.$slug.tsx` inserts a `course_ratings` row (359) or updates the existing one (351). One rating per Student per course (unique index, `schema.ts:322`), whole stars 1-5. The action (453-481) requires an Enrollment. | Student | Instructor of the course (new or changed rating). A rating survives a later Refund, because the Enrollment is deleted but the rating row is not. | Low to medium, and re-ratings repeat. | No. |

### Quizzes

| # | Event | Where | Caused by | Affects | Frequency | Email today |
| --- | --- | --- | --- | --- | --- | --- |
| 14 | **Quiz attempt submitted, passed or failed** | `computeResult` in the lesson route inserts into `quiz_attempts` (603) and `quiz_answers` (615). The action `submit-quiz` is at 952. The pass mark is hard-coded as `scoreValue > 0.7` (599). | Student | Student (the result, which they already see on screen at once). Instructor (a pass-rate signal; little value per attempt). | High volume, low value as a notification. | No. |
| 15 | **Quiz created, replaced, or deleted** | `instructor.$courseId.lessons.$lessonId.quiz.tsx`: `save-quiz` (386-424) and `delete-quiz` (425). Saving over an existing quiz first calls `deleteQuiz`, which deletes the old attempts and answers (201-220). | Instructor or Platform Admin | Students who already passed lose their attempt history. A weak notification case. | Low. | No. |

### Course and lesson publishing

| # | Event | Where | Caused by | Affects | Frequency | Email today |
| --- | --- | --- | --- | --- | --- | --- |
| 16 | **Course status changed** (`draft`, `published`, `archived`) | `updateCourseStatus` from the Instructor editor (`instructor.$courseId.tsx:154`, called at 695-697) or the admin override (`admin.courses.tsx:76`, called at 141-143). New courses start as `draft` (`instructor.new.tsx:68`). | Instructor, or Platform Admin | Enrolled Students (a course archived under them, although the lesson viewer does not check status). Instructor (when a Platform Admin changes their course; the admin route has no owner check). Prospective Students: only `published` courses appear in the catalog (`courses.tsx:288`, `home.tsx:115`) and the purchase flow (`courses.$slug.purchase.tsx:286`), but Cadence has no follower or wishlist data to target them. | Very low. | No. |

## Gaps: things the ticket names that Cadence does not have

1. **Lesson publishing.** `lessons` has no status column (`schema.ts:105-119`). A lesson is live to enrolled Students the moment `add-lesson` inserts it (`instructor.$courseId.tsx:753-762`), and that insert has a title only; content is filled in later by `update-lesson` (`instructor.$courseId.lessons.$lessonId.tsx:207-226`). A "new lesson" event would therefore fire on an empty shell. It needs a draft flag or an agreed trigger first.
2. **Course completion.** `enrollments.completedAt` exists and is read (`dashboard.tsx:213`, the roster, the instructor editor), but **nothing writes it**. Lesson completion is written (`markLessonComplete`, lesson route 218-243, action `mark-complete` at 948), so "Student finished every lesson" is derivable but never recorded. This is the missing hook for a congratulations or certificate notification (`_internal/feature-ideas.md`, items 14 and 29).
3. **Pending, Issued and Failed Refund.** The glossary defines them, but the code has none. Approving a Refund Request sets `amountRefunded` in the same transaction (`refunds.server.ts:669-677`), and there is no payment provider or money-movement step. "Your money has been sent" and "your refund failed" cannot fire. Approval is the only signal today.
4. **Team Licence invites.** Seats are bearer links (`/redeem/:code`), and no user is attached to a Seat until it is claimed. There is no invite, no assignment to an email address, and no `Member` team role written anywhere. A Team Admin can be told about claims, never about who has not claimed.
5. **Welcome email.** The stub in `enrollUser` (`purchase.tsx:173-175`) shows it was meant to exist and was never built. The `/welcome` page (`courses.$slug.welcome.tsx`) is the only post-purchase surface.
6. **Account events.** Sign-up (`signup.tsx:78`), role changes (`admin.users.tsx:126-128`) and profile edits (`settings.tsx:92`) change state. Only a role change has a plausible recipient (the user whose role changed). Listed for completeness.
7. **Platform Admin awareness of work waiting.** The Refund Request queue and the unanswered-questions queue exist, but neither alerts anyone. Both are pull surfaces only.
8. **Notification preferences.** There is no table or setting for them (`schema.ts` has none, and `settings.tsx` edits name and bio only).

## Observations worth carrying into design

- **Every event runs in a route action or a `*.server.ts` function that already knows the actor and the course.** A trigger can sit where `sendEmail` sits today, after the database write succeeds (`courses.$slug.refund.ts:75`, `admin.refunds.tsx:130`). The refund functions return an `email` value for the route to send, which a notification could copy.
- **Two events are already Postmark emails** (6 and 8). Adding in-app notifications for them reaches the buyer twice, so the map needs a rule on whether in-app and email overlap.
- **Recipient lookup is cheap for events 1, 2, 3, 6, 8, 9, 10 and 13** (one or two joins from the row just written). It is awkward for 5 (unknown Seat holders), 16 (no follower data) and 12.
- **Fan-out is bounded for every event except 16** (all enrolled Students of a course) **and event 6** (every Platform Admin, or a chosen subset). Event 6 needs a design choice.
- **`users.id` is the natural recipient key.** It is stable, present on every row above, and what the session cookie holds (`app/lib/session.ts`).
- A side finding, unrelated to the question: the quiz pass mark is hard-coded at 70 percent (`lessons.$lessonId.tsx:599`) while `quizzes.passingScore` is stored and editable (`schema.ts:163`, `quiz.tsx:172-198`). A "you passed" notification would disagree with what the Instructor configured.

## Sources

All first-party, in this repo at `979e285`:

`GLOSSARY.md`, `docs/adr/0001` to `0004`, `README.md` (mentions Knock for notifications), `app/db/schema.ts`, `app/lib/mailer.server.ts`, `app/lib/refunds.server.ts`, `app/lib/refund-rules.ts`, `app/lib/access.server.ts`, `app/lib/enrollments.ts`, `app/lib/comments.ts`, `app/lib/ratings.ts`, `app/routes/courses.$slug.purchase.tsx`, `app/routes/redeem.$code.tsx`, `app/routes/courses.$slug.refund.ts`, `app/routes/admin.refunds.tsx`, `app/routes/courses.$slug.lessons.$lessonId.tsx`, `app/routes/instructor.questions.tsx`, `app/routes/courses.$slug.tsx`, `app/routes/instructor.$courseId.tsx`, `app/routes/instructor.$courseId.lessons.$lessonId.tsx`, `app/routes/instructor.$courseId.lessons.$lessonId.quiz.tsx`, `app/routes/instructor.$courseId.students.tsx`, `app/routes/admin.courses.tsx`, `app/routes/admin.users.tsx`, `app/routes/team.tsx`, `app/routes/signup.tsx`, `app/routes/settings.tsx`, `_internal/feature-ideas.md`.
