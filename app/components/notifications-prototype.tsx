// PROTOTYPE — throwaway. Three structurally different takes on the
// Notification bell, Notification Feed and Toasts, mounted in the real app
// layout and switched with ?variant=A|B|C.
//   A  Sidebar bell     — bell beside the logo, popover flies out right, stock toasts bottom-right
//   B  Header + page    — new top bar, bell top-right, dropdown + full feed page, card toasts top-right
//   C  Inbox drawer     — "Notifications" nav item with count, full-height drawer, compact toasts bottom-left
// State is in memory only. Lives on branch prototype/notification-ui. Never merge.
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  CheckCheck,
  Inbox,
  MessageSquare,
  Receipt,
  ShoppingCart,
  Ticket,
  X,
  Zap,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserAvatar } from "~/components/user-avatar";
import { PrototypeSwitcher } from "~/components/prototype-switcher";
import type {
  ProtoEvent,
  ProtoNotification,
  ProtoPart,
} from "~/lib/notifications-prototype.server";

export const VARIANTS = [
  { key: "A", name: "Sidebar bell" },
  { key: "B", name: "Header + page" },
  { key: "C", name: "Inbox drawer" },
];

export type Variant = "A" | "B" | "C";

export function useVariant(): Variant {
  const [params] = useSearchParams();
  const v = params.get("variant");
  return v === "B" || v === "C" ? v : "A";
}

export const TOASTER_PROPS: Record<
  Variant,
  { position: "bottom-right" | "top-right" | "bottom-left"; offset?: object }
> = {
  A: { position: "bottom-right" },
  B: { position: "top-right", offset: { top: 64 } },
  C: { position: "bottom-left", offset: { left: 240 } },
};

// ---------- shared bits (data + state only; each variant owns its layout) ----------

function Sentence({ parts }: { parts: ProtoPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <strong key={i} className="font-semibold text-foreground">
            {p.b}
          </strong>
        )
      )}
    </>
  );
}

function ago(m: number) {
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
  if (m < 60 * 48) return "Yesterday";
  return `${Math.floor(m / (60 * 24))}d`;
}

const EVENT_ICON: Record<ProtoEvent, { icon: React.ReactNode; tint: string }> = {
  A: { icon: <ShoppingCart className="size-4" />, tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  B: { icon: <ShoppingCart className="size-4" />, tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  C: { icon: <Ticket className="size-4" />, tint: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  D: { icon: <Receipt className="size-4" />, tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  E: { icon: <Receipt className="size-4" />, tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  F: { icon: <MessageSquare className="size-4" />, tint: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  G: { icon: <MessageSquare className="size-4" />, tint: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
  H: { icon: <MessageSquare className="size-4" />, tint: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
};

export function useProtoFeed(
  userId: number | null,
  initial: ProtoNotification[],
  pool: ProtoNotification[]
) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(0);
  const [lastSimulated, setLastSimulated] = useState<ProtoNotification | null>(null);
  // Reset the in-memory feed when the DevUI switches user.
  const [owner, setOwner] = useState(userId);
  if (owner !== userId) {
    setOwner(userId);
    setItems(initial);
    setLastSimulated(null);
  }
  const navigate = useNavigate();
  const variant = useVariant();

  function open(item: ProtoNotification) {
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
    const [path, hash] = item.href.split("#");
    navigate(`${path}?variant=${variant}${hash ? `#${hash}` : ""}`);
  }
  function markRead(id: string) {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x)));
  }
  function markAllRead() {
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
  }
  function simulate() {
    if (!pool.length) return null;
    const base = pool[cursor % pool.length];
    const item = { ...base, id: `${base.id}-${cursor}`, minutesAgo: 0, read: false };
    setCursor((c) => c + 1);
    setItems((xs) => [item, ...xs]);
    setLastSimulated(item);
    return item;
  }
  return {
    items,
    unread: items.filter((x) => !x.read).length,
    open,
    markRead,
    markAllRead,
    simulate,
    lastSimulated,
  };
}

export type ProtoFeed = ReturnType<typeof useProtoFeed>;

// ---------- Variant A: sidebar bell + fly-out popover, stock toasts ----------

export function VariantABell({ feed }: { feed: ProtoFeed }) {
  const [openState, setOpen] = useState(false);
  return (
    <Popover.Root open={openState} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title="Notifications"
        >
          <Bell className="size-5" />
          {feed.unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
              {feed.unread > 9 ? "9+" : feed.unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={18}
          className="z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold">Notifications</span>
            <button onClick={feed.markAllRead} className="text-xs text-muted-foreground hover:text-foreground">
              Mark all as read
            </button>
          </div>
          <ul className="max-h-[28rem] overflow-y-auto">
            {feed.items.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</li>
            )}
            {feed.items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    setOpen(false);
                    feed.open(n);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <UserAvatar name={n.actor.name} avatarUrl={n.actor.avatarUrl} className="size-8 shrink-0" />
                  <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                    <Sentence parts={n.parts} />
                    <div className="mt-0.5 text-xs">{ago(n.minutesAgo)}</div>
                  </div>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function fireToastA(n: ProtoNotification, feed: ProtoFeed) {
  toast(<span className="text-muted-foreground"><Sentence parts={n.parts} /></span>, {
    action: { label: "View", onClick: () => feed.open(n) },
  });
}

// ---------- Variant B: top header bar, dropdown, full feed page, card toasts ----------

export function VariantBHeader({
  feed,
  onSeeAll,
}: {
  feed: ProtoFeed;
  onSeeAll: () => void;
}) {
  const [openState, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const shown = tab === "unread" ? feed.items.filter((n) => !n.read) : feed.items;
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-3 border-b bg-background/95 px-6 backdrop-blur">
      <Popover.Root open={openState} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-accent">
            <Bell className="size-4" />
            {feed.unread > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                {feed.unread}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">0</span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            className="z-50 w-[26rem] rounded-xl border bg-popover text-popover-foreground shadow-2xl"
          >
            <div className="flex items-center gap-1 border-b p-2">
              {(["unread", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm capitalize",
                    tab === t ? "bg-accent font-medium" : "text-muted-foreground"
                  )}
                >
                  {t}
                  {t === "unread" && feed.unread > 0 && ` (${feed.unread})`}
                </button>
              ))}
              <button onClick={feed.markAllRead} className="ml-auto p-1 text-muted-foreground hover:text-foreground" title="Mark all as read">
                <CheckCheck className="size-4" />
              </button>
            </div>
            <ul className="max-h-96 divide-y overflow-y-auto">
              {shown.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing unread.</li>
              )}
              {shown.slice(0, 6).map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setOpen(false);
                      feed.open(n);
                    }}
                    className="flex w-full gap-3 px-4 py-3 text-left hover:bg-accent"
                  >
                    <div className={cn("w-1 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} />
                    <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                      <Sentence parts={n.parts} />
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(n.minutesAgo)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                setOpen(false);
                onSeeAll();
              }}
              className="block w-full border-t py-2.5 text-center text-sm font-medium text-primary hover:bg-accent"
            >
              See all notifications
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </header>
  );
}

const FILTERS: { label: string; events: ProtoEvent[] | null }[] = [
  { label: "All", events: null },
  { label: "Refunds", events: ["D", "E"] },
  { label: "Comments", events: ["F", "G", "H"] },
  { label: "Sales & Seats", events: ["A", "B", "C"] },
];

export function VariantBPage({ feed, onClose }: { feed: ProtoFeed; onClose: () => void }) {
  const [filter, setFilter] = useState(0);
  const evs = FILTERS[filter].events;
  const shown = feed.items.filter((n) => !evs || evs.includes(n.event));
  const today = shown.filter((n) => n.minutesAgo < 60 * 24);
  const earlier = shown.filter((n) => n.minutesAgo >= 60 * 24);
  return (
    <div className="mx-auto max-w-3xl p-8">
      <button onClick={onClose} className="mb-4 text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </button>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">{feed.unread} unread</p>
        </div>
        <button onClick={feed.markAllRead} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          Mark all as read
        </button>
      </div>
      <div className="mb-6 flex gap-2">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => setFilter(i)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === i ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {[
        ["Today", today],
        ["Earlier", earlier],
      ].map(([label, list]) =>
        (list as ProtoNotification[]).length ? (
          <section key={label as string} className="mb-8">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label as string}</h2>
            <div className="divide-y rounded-lg border">
              {(list as ProtoNotification[]).map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    onClose();
                    feed.open(n);
                  }}
                  className={cn("flex w-full items-center gap-4 px-4 py-4 text-left hover:bg-accent", !n.read && "bg-primary/5")}
                >
                  <UserAvatar name={n.actor.name} avatarUrl={n.actor.avatarUrl} className="size-10" />
                  <div className="flex-1 text-sm text-muted-foreground">
                    <Sentence parts={n.parts} />
                  </div>
                  <span className="text-xs text-muted-foreground">{ago(n.minutesAgo)}</span>
                  {!n.read && <span className="size-2 rounded-full bg-primary" />}
                </button>
              ))}
            </div>
          </section>
        ) : null
      )}
    </div>
  );
}

function fireToastB(n: ProtoNotification, feed: ProtoFeed) {
  toast.custom(
    (t) => (
      <div className="flex w-[22rem] items-start gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl">
        <UserAvatar name={n.actor.name} avatarUrl={n.actor.avatarUrl} className="size-9" />
        <div className="flex-1">
          <div className="text-sm text-muted-foreground">
            <Sentence parts={n.parts} />
          </div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                toast.dismiss(t);
                feed.open(n);
              }}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              Open
            </button>
            <button onClick={() => toast.dismiss(t)} className="rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    ),
    { duration: 8000 }
  );
}

// ---------- Variant C: inbox-style nav item + full-height drawer, compact toasts ----------

export function VariantCNavItem({ feed, onOpen }: { feed: ProtoFeed; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {feed.unread > 0 ? <BellRing className="size-4 text-primary" /> : <Inbox className="size-4" />}
      <span className={cn(feed.unread > 0 && "text-sidebar-foreground")}>Notifications</span>
      {feed.unread > 0 && (
        <span className="ml-auto rounded-md bg-sidebar-accent px-1.5 text-xs font-semibold text-sidebar-foreground">
          {feed.unread}
        </span>
      )}
    </button>
  );
}

export function VariantCDrawer({ feed, open, onClose }: { feed: ProtoFeed; open: boolean; onClose: () => void }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  if (!open) return null;
  const shown = unreadOnly ? feed.items.filter((n) => !n.read) : feed.items;
  const groups: [string, ProtoNotification[]][] = [
    ["Today", shown.filter((n) => n.minutesAgo < 60 * 24)],
    ["Earlier", shown.filter((n) => n.minutesAgo >= 60 * 24)],
  ];
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[28rem] flex-col border-l bg-background shadow-2xl">
        <div className="flex h-14 items-center gap-3 border-b px-5">
          <span className="text-lg font-semibold">Notifications</span>
          <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            Unread only
          </label>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {groups.map(([label, list]) =>
            list.length ? (
              <section key={label}>
                <div className="sticky top-0 flex items-center justify-between bg-muted/80 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {label}
                  {label === "Today" && (
                    <button onClick={feed.markAllRead} className="normal-case tracking-normal hover:text-foreground">
                      Mark all as read
                    </button>
                  )}
                </div>
                {list.map((n) => (
                  <div key={n.id} className={cn("group relative flex gap-3 border-b px-5 py-4", !n.read && "bg-primary/5")}>
                    <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", EVENT_ICON[n.event].tint)}>
                      {EVENT_ICON[n.event].icon}
                    </div>
                    <button onClick={() => { onClose(); feed.open(n); }} className="min-w-0 flex-1 text-left">
                      <div className={cn("text-sm", n.read ? "text-muted-foreground" : "text-foreground")}>
                        <Sentence parts={n.parts} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{ago(n.minutesAgo)} ago</div>
                    </button>
                    {!n.read && (
                      <button
                        onClick={() => feed.markRead(n.id)}
                        className="self-start rounded-md p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                        title="Mark as read"
                      >
                        <CheckCheck className="size-4" />
                      </button>
                    )}
                  </div>
                ))}
              </section>
            ) : null
          )}
          {shown.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">Nothing here.</div>
          )}
        </div>
      </aside>
    </>
  );
}

function fireToastC(n: ProtoNotification, feed: ProtoFeed) {
  toast.custom(
    (t) => (
      <button
        onClick={() => {
          toast.dismiss(t);
          feed.open(n);
        }}
        className="flex w-[20rem] items-center gap-2.5 rounded-lg border bg-popover px-3 py-2 text-left text-popover-foreground shadow-lg"
      >
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", EVENT_ICON[n.event].tint)}>
          {EVENT_ICON[n.event].icon}
        </span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          <Sentence parts={n.parts} />
        </span>
      </button>
    ),
    { duration: 5000 }
  );
}

// ---------- switcher with a "simulate event" control ----------

export function NotificationsPrototypeBar({ feed, variant }: { feed: ProtoFeed; variant: Variant }) {
  function simulate() {
    const n = feed.simulate();
    if (!n || !n.toast) return;
    ({ A: fireToastA, B: fireToastB, C: fireToastC })[variant](n, feed);
  }
  const last = feed.lastSimulated;
  return (
    <PrototypeSwitcher variants={VARIANTS} current={variant}>
      <span className="mx-1 h-5 w-px bg-white/30" />
      <button onClick={simulate} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">
        <Zap className="size-3.5" /> Simulate event
      </button>
      <span className="px-2 text-xs text-white/80">
        {feed.unread} unread / {feed.items.length}
        {last && ` · last: ${last.event} ${last.toast ? "(toast)" : "(feed only)"}`}
      </span>
    </PrototypeSwitcher>
  );
}
