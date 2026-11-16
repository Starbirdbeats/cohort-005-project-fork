// PROTOTYPE — throwaway. Builds fake Notifications from real DB names so the
// bell / feed / toast variants can be judged against real density.
// Lives on branch prototype/notification-ui only. Never merge.
import { eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { users, courses, modules, lessons, UserRole } from "~/db/schema";

export type ProtoEvent = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type ProtoPart = string | { b: string };

export interface ProtoNotification {
  id: string;
  event: ProtoEvent;
  parts: ProtoPart[];
  href: string;
  minutesAgo: number;
  read: boolean;
  toast: boolean;
  actor: { name: string; avatarUrl: string | null };
}

// Events that also show as a Toast (from "Which events notify which role").
const TOAST_EVENTS: ProtoEvent[] = ["D", "E", "F", "G"];

export function buildPrototypeNotifications(
  currentUser: { id: number; role: UserRole } | null,
  isTeamAdmin: boolean
): { feed: ProtoNotification[]; simulatePool: ProtoNotification[] } {
  if (!currentUser) return { feed: [], simulatePool: [] };

  const others = db
    .select({ name: users.name, avatarUrl: users.avatarUrl, role: users.role })
    .from(users)
    .where(ne(users.id, currentUser.id))
    .all();
  const students = others.filter((u) => u.role === UserRole.Student);
  const staff = others.filter((u) => u.role !== UserRole.Student);
  const pick = <T,>(list: T[], i: number, fallback: T) =>
    list.length ? list[i % list.length] : fallback;
  const anon = { name: "Sam Rivera", avatarUrl: null, role: UserRole.Student };
  const student = (i: number) => pick(students, i, anon);
  const staffer = (i: number) => pick(staff, i, anon);

  const ownCourses =
    currentUser.role === UserRole.Instructor
      ? db.select().from(courses).where(eq(courses.instructorId, currentUser.id)).all()
      : [];
  const allCourses = db.select().from(courses).all();
  const courseList = ownCourses.length ? ownCourses : allCourses;
  const course = (i: number) =>
    pick(courseList, i, { id: 0, title: "Intro to Cadence", slug: "intro" } as (typeof allCourses)[number]);

  const lessonRow = (i: number) => {
    const c = course(i);
    const row = db
      .select({ id: lessons.id, title: lessons.title })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(eq(modules.courseId, c.id))
      .limit(1)
      .get();
    return {
      title: row?.title ?? "Getting started",
      href: `/courses/${c.slug}/lessons/${row?.id ?? 1}#comment-${100 + i}`,
    };
  };

  let n = 0;
  const make = (
    event: ProtoEvent,
    actor: { name: string; avatarUrl: string | null },
    parts: ProtoPart[],
    href: string,
    minutesAgo: number,
    read = false
  ): ProtoNotification => ({
    id: `p${n++}`,
    event,
    parts,
    href,
    minutesAgo,
    read,
    toast: TOAST_EVENTS.includes(event),
    actor: { name: actor.name, avatarUrl: actor.avatarUrl },
  });

  const feed: ProtoNotification[] = [];
  const pool: ProtoNotification[] = [];

  if (currentUser.role === UserRole.Instructor) {
    const c0 = course(0), c1 = course(1);
    const l0 = lessonRow(0), l1 = lessonRow(1);
    feed.push(
      make("F", student(0), [{ b: student(0).name }, " commented on ", { b: l0.title }, " in ", { b: c0.title }], "/instructor/questions", 4),
      make("A", student(1), [{ b: student(1).name }, " enrolled on ", { b: c0.title }], `/instructor/${c0.id}/students`, 38),
      make("C", student(2), [{ b: student(2).name }, " enrolled on ", { b: c1.title }, " through a Team Licence"], `/instructor/${c1.id}/students`, 95),
      make("B", student(3), [{ b: student(3).name }, " bought a Team Licence for ", { b: "10 Seats" }, " on ", { b: c1.title }], `/instructor/${c1.id}/students`, 60 * 5),
      make("H", student(4), [{ b: student(4).name }, " replied to your comment on ", { b: l1.title }], l1.href, 60 * 26, true),
      make("A", student(5), [{ b: student(5).name }, " enrolled on ", { b: c1.title }], `/instructor/${c1.id}/students`, 60 * 30, true),
      make("F", student(6), [{ b: student(6).name }, " commented on ", { b: l1.title }, " in ", { b: c1.title }], "/instructor/questions", 60 * 72, true)
    );
    pool.push(
      make("F", student(7), [{ b: student(7).name }, " commented on ", { b: l0.title }, " in ", { b: c0.title }], "/instructor/questions", 0),
      make("A", student(8), [{ b: student(8).name }, " enrolled on ", { b: c0.title }], `/instructor/${c0.id}/students`, 0)
    );
  } else if (currentUser.role === UserRole.Admin) {
    const c0 = course(0), c1 = course(2);
    const l0 = lessonRow(0);
    feed.push(
      make("D", student(0), [{ b: student(0).name }, " asked for a refund of ", { b: "$49.00" }, " on ", { b: c0.title }], "/admin/refunds", 12),
      make("D", student(1), [{ b: student(1).name }, " asked for a refund of ", { b: "$129.00" }, " on ", { b: c1.title }], "/admin/refunds", 140),
      make("H", student(2), [{ b: student(2).name }, " replied to your comment on ", { b: l0.title }], l0.href, 60 * 20, true),
      make("D", student(3), [{ b: student(3).name }, " asked for a refund of ", { b: "$49.00" }, " on ", { b: c1.title }], "/admin/refunds", 60 * 50, true)
    );
    pool.push(
      make("D", student(4), [{ b: student(4).name }, " asked for a refund of ", { b: "$79.00" }, " on ", { b: c0.title }], "/admin/refunds", 0),
      make("H", student(5), [{ b: student(5).name }, " replied to your comment on ", { b: l0.title }], l0.href, 0)
    );
  } else {
    const c0 = course(0), c1 = course(1);
    const l0 = lessonRow(0), l1 = lessonRow(1);
    feed.push(
      make("G", staffer(0), [{ b: staffer(0).name }, " replied to your comment on ", { b: l0.title }], l0.href, 7),
      make("E", staffer(1), ["Your refund on ", { b: c1.title }, " was ", { b: "approved" }], `/courses/${c1.slug}`, 60 * 3),
      make("H", student(1), [{ b: student(1).name }, " replied to your comment on ", { b: l1.title }], l1.href, 60 * 28, true)
    );
    pool.push(
      make("G", staffer(2), [{ b: staffer(2).name }, " replied to your comment on ", { b: l1.title }], l1.href, 0),
      make("H", student(3), [{ b: student(3).name }, " replied to your comment on ", { b: l0.title }], l0.href, 0)
    );
    if (isTeamAdmin) {
      feed.unshift(
        make("C", student(4), [{ b: student(4).name }, " claimed a Seat on ", { b: c0.title }, " (7 of 10 claimed)"], "/team", 22),
        make("C", student(5), [{ b: student(5).name }, " claimed a Seat on ", { b: c0.title }, " (6 of 10 claimed)"], "/team", 60 * 6, true)
      );
      feed.push(
        make("E", staffer(1), ["Your refund on the ", { b: c1.title }, " Team Licence was ", { b: "declined" }], "/team", 60 * 49, true)
      );
      pool.push(
        make("C", student(6), [{ b: student(6).name }, " claimed a Seat on ", { b: c0.title }, " (8 of 10 claimed)"], "/team", 0)
      );
    }
  }

  feed.sort((a, b) => a.minutesAgo - b.minutesAgo);
  return { feed, simulatePool: pool };
}
