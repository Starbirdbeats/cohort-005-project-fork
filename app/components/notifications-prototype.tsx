// PROTOTYPE — throwaway. The locked hi-fi notification design, built into the
// real app so it can be judged in place:
//   compact: floating bell with a red dot, opening a segments deck (one card at a time)
//   expanded: the /notifications page with tabs
// Values come from docs/prototypes/notification-hifi-tokens.json (saved in the tweaker).
// State is in memory only. Lives on branch prototype/notification-ui. Never merge.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Bell, CheckCheck, ChevronLeft, ChevronRight, X, Zap } from "lucide-react";
import { cn } from "~/lib/utils";
import type {
  ProtoEvent,
  ProtoNotification,
  ProtoPart,
} from "~/lib/notifications-prototype.server";

// ---------- locked tokens (from the tweaker) ----------
const T = {
  bell: { size: 36, icon: 20, top: 12, right: 16 },
  dot: { size: 6, ring: 2, inset: 7, color: "oklch(0.637 0.237 25.331)" },
  card: { width: 400, gap: 9, radius: 14, padX: 16, padY: 19 },
  text: { size: 15, lineHeight: 1.45, nounWeight: 600, timeSize: 11 },
  seg: { height: 3, gap: 6, radius: 3, max: 8, unlit: 14, space: 18 },
  foot: { gap: 4, button: 27, iconButton: 28, x: 28, xIcon: 16 },
  toast: { drop: 18, ms: 520, hideAfter: 6000 },
  motion: { deckMs: 200, deckScale: 0.95, flipPx: 10, flipMs: 180, xMs: 160 },
  page: { pad: 32, title: 24, headGap: 20, tabSize: 14, tabGap: 20, groupGap: 17, rowPadY: 12, rowPadX: 13, rowText: 13 },
};
const DECK_TOP = T.bell.top + T.bell.size + T.card.gap;

const CATEGORY: Record<ProtoEvent, string> = {
  A: "Sales and Seats",
  B: "Sales and Seats",
  C: "Sales and Seats",
  D: "Refunds",
  E: "Refunds",
  F: "Comments",
  G: "Comments",
  H: "Comments",
};

function timeAgo(m: number) {
  if (m < 1) return "Just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  if (m < 60 * 24) {
    const h = Math.floor(m / 60);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (m < 60 * 48) return "Yesterday";
  return `${Math.floor(m / (60 * 24))} days ago`;
}

function Sentence({ parts, size, clamp }: { parts: ProtoPart[]; size: number; clamp?: boolean }) {
  return (
    <div
      className={cn("text-muted-foreground", clamp && "line-clamp-2")}
      style={{ fontSize: size, lineHeight: T.text.lineHeight }}
    >
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <b key={i} className="text-foreground" style={{ fontWeight: T.text.nounWeight }}>
            {p.b}
          </b>
        )
      )}
    </div>
  );
}

// ---------- shared in-memory state ----------
interface ProtoCtx {
  items: ProtoNotification[];
  unread: ProtoNotification[];
  toast: ProtoNotification | null;
  toastLeaving: boolean;
  markRead: (id: string) => void;
  markAllRead: () => void;
  open: (n: ProtoNotification) => void;
  dismissToast: (markAsRead: boolean) => void;
  simulate: () => void;
  reset: () => void;
  lastEvent: string;
}
const Ctx = createContext<ProtoCtx | null>(null);
export const useNotificationsProto = () => useContext(Ctx);

export function NotificationsProtoProvider({
  userId,
  initial,
  pool,
  children,
}: {
  userId: number | null;
  initial: ProtoNotification[];
  pool: ProtoNotification[];
  children: React.ReactNode;
}) {
  const [items, setItems] = useState(initial);
  const [toast, setToast] = useState<ProtoNotification | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [lastEvent, setLastEvent] = useState("");
  const [owner, setOwner] = useState(userId);
  const timers = useRef<number[]>([]);
  const navigate = useNavigate();

  // Reset when the DevUI switches user.
  if (owner !== userId) {
    setOwner(userId);
    setItems(initial);
    setToast(null);
    setLastEvent("");
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const markRead = useCallback(
    (id: string) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x))),
    []
  );
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const dismissToast = useCallback(
    (markAsRead: boolean) => {
      const t = toastRef.current;
      if (!t) return;
      if (markAsRead) markRead(t.id);
      setToastLeaving(true);
      timers.current.push(
        window.setTimeout(() => {
          setToast((cur) => (cur?.id === t.id ? null : cur));
          setToastLeaving(false);
        }, T.toast.ms)
      );
    },
    [markRead]
  );
  const value: ProtoCtx = {
    items,
    unread: items.filter((x) => !x.read),
    toast,
    toastLeaving,
    markRead,
    markAllRead: () => setItems((xs) => xs.map((x) => ({ ...x, read: true }))),
    open: (n) => {
      markRead(n.id);
      setToast(null);
      navigate(n.href);
    },
    dismissToast,
    simulate: () => {
      if (!pool.length) return;
      const base = pool[cursor % pool.length];
      const n = { ...base, id: `${base.id}-${cursor}`, minutesAgo: 0, read: false };
      setCursor((c) => c + 1);
      setItems((xs) => [n, ...xs]);
      setLastEvent(`${n.event} ${n.toast ? "(toast)" : "(dot only)"}`);
      if (n.toast) {
        setToastLeaving(false);
        setToast(n);
        timers.current.push(
          window.setTimeout(() => {
            setToastLeaving(true);
            timers.current.push(
              window.setTimeout(() => {
                setToast((cur) => (cur?.id === n.id ? null : cur));
                setToastLeaving(false);
              }, T.toast.ms)
            );
          }, T.toast.hideAfter)
        );
      }
    },
    reset: () => {
      setItems(initial);
      setToast(null);
      setLastEvent("");
    },
    lastEvent,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const KEYFRAMES = `
@keyframes nfPop { from { opacity:0; transform:scale(${T.motion.deckScale}) translateY(-4px); } }
@keyframes nfPopOut { to { opacity:0; transform:scale(.97) translateY(-4px); } }
@keyframes nfToastIn { from { opacity:0; transform:translateY(-${T.toast.drop}px); } }
@keyframes nfToastOut { to { opacity:0; transform:translateY(-${T.toast.drop}px); } }
@keyframes nfInR { from { opacity:0; transform:translateX(${T.motion.flipPx}px); } }
@keyframes nfInL { from { opacity:0; transform:translateX(-${T.motion.flipPx}px); } }
@keyframes nfInU { from { opacity:0; transform:translateY(6px); } }
@keyframes nfOut { to { opacity:0; transform:translateX(16px); } }
@keyframes nfDot { from { transform:scale(0); } }
@media (prefers-reduced-motion: reduce) { .nf-anim { animation-duration:1ms !important; } }
`;
const EASE_OUT = "cubic-bezier(.23,1,.32,1)";

// ---------- compact: bell + segments deck + toast ----------
function Segments({ len, idx }: { len: number; idx: number }) {
  if (len <= 1) return null;
  const shown = Math.min(len, T.seg.max);
  const cur = Math.min(idx, shown - 1);
  const more = len > T.seg.max;
  return (
    <div
      className="flex"
      style={{ gap: T.seg.gap, height: T.seg.height, margin: `0 ${T.foot.x + 6}px ${T.seg.space}px 0` }}
    >
      {Array.from({ length: shown }, (_, i) => {
        const pct = i === cur ? 100 : more && i === shown - 1 ? Math.round(T.seg.unlit / 2) : T.seg.unlit;
        return (
          <i
            key={i}
            className="flex-1 transition-colors duration-200"
            style={{
              borderRadius: T.seg.radius,
              background: `color-mix(in oklab, var(--foreground) ${pct}%, transparent)`,
            }}
          />
        );
      })}
    </div>
  );
}

function IconButton({ onClick, label, children, size = T.foot.iconButton }: { onClick: () => void; label: string; children: React.ReactNode; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      style={{ width: size, height: size }}
    >
      {children}
    </button>
  );
}

function Card({
  n,
  len,
  idx,
  mode,
  contentAnim,
  onX,
  onOpen,
  onFlip,
}: {
  n: ProtoNotification;
  len: number;
  idx: number;
  mode: "deck" | "toast";
  contentAnim: string;
  onX: () => void;
  onOpen: () => void;
  onFlip?: (d: 1 | -1) => void;
}) {
  const flip = mode === "deck" && len > 1;
  const label = mode === "toast" ? "New" : len === 1 ? "Last one" : "";
  return (
    <div
      className="relative border bg-popover text-popover-foreground"
      style={{
        borderRadius: T.card.radius,
        padding: `${T.card.padY}px ${T.card.padX}px`,
        boxShadow: "0 12px 32px -8px rgb(0 0 0 / .16), 0 2px 6px rgb(0 0 0 / .06)",
      }}
    >
      <div className="absolute" style={{ top: 6, right: 6 }}>
        <IconButton onClick={onX} label="Mark as read" size={T.foot.x}>
          <X style={{ width: T.foot.xIcon, height: T.foot.xIcon }} />
        </IconButton>
      </div>
      {mode === "deck" && <Segments len={len} idx={idx} />}
      <div className="nf-anim" style={{ animation: contentAnim }}>
        <div style={{ paddingRight: T.foot.x - 4 }}>
          <Sentence parts={n.parts} size={T.text.size} clamp />
        </div>
        <div className="flex items-center justify-between gap-2" style={{ marginTop: T.foot.gap, minHeight: T.foot.iconButton }}>
          <span className="text-muted-foreground" style={{ fontSize: T.text.timeSize }}>
            {timeAgo(n.minutesAgo)}
          </span>
          <div className="flex items-center gap-1.5">
            {flip ? (
              <div className="flex gap-0.5">
                <IconButton onClick={() => onFlip?.(-1)} label="Previous">
                  <ChevronLeft className="size-4" />
                </IconButton>
                <IconButton onClick={() => onFlip?.(1)} label="Next">
                  <ChevronRight className="size-4" />
                </IconButton>
              </div>
            ) : (
              label && <span className="text-xs text-muted-foreground">{label}</span>
            )}
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 active:scale-[.97]"
              style={{ height: T.foot.button }}
            >
              View
              <ArrowRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:text-foreground"
      style={{ background: "color-mix(in oklab, var(--background) 80%, transparent)" }}
    >
      All notifications
      <ArrowRight className="size-3" />
    </button>
  );
}

export function NotificationBell() {
  const ctx = useNotificationsProto();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const [idx, setIdx] = useState(0);
  const [contentAnim, setContentAnim] = useState("");
  const [flipKey, setFlipKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [dotAnim, setDotAnim] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hadUnread = useRef(false);

  const unread = ctx?.unread ?? [];
  const len = unread.length;
  const safeIdx = len ? idx % len : 0;

  useEffect(() => {
    if (len > 0 && !hadUnread.current) setDotAnim(true);
    hadUnread.current = len > 0;
  }, [len]);

  const close = useCallback(() => {
    setPhase((p) => (p === "open" ? "closing" : p));
    window.setTimeout(() => setPhase((p) => (p === "closing" ? "closed" : p)), 140);
  }, []);
  const flip = useCallback(
    (d: 1 | -1) => {
      if (len < 2) return;
      setIdx((i) => (i + d + len) % len);
      setContentAnim(`${d > 0 ? "nfInR" : "nfInL"} ${T.motion.flipMs}ms ${EASE_OUT}`);
      setFlipKey((k) => k + 1);
    },
    [len]
  );

  useEffect(() => {
    if (phase !== "open") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") flip(-1);
      if (e.key === "ArrowRight") flip(1);
    }
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [phase, close, flip]);

  if (!ctx) return null;
  const isOpen = phase !== "closed";

  function toggle() {
    if (isOpen) return close();
    ctx!.dismissToast(false);
    setIdx(0);
    setContentAnim("");
    setPhase("open");
  }
  function markTop() {
    const n = unread[safeIdx];
    if (!n || leaving) return;
    setLeaving(true);
    setContentAnim(`nfOut ${T.motion.xMs}ms ease-out forwards`);
    window.setTimeout(() => {
      ctx!.markRead(n.id);
      setLeaving(false);
      setContentAnim(`nfInU 220ms ${EASE_OUT}`);
      setFlipKey((k) => k + 1);
    }, T.motion.xMs);
  }
  function openItem(n: ProtoNotification) {
    ctx!.open(n);
    close();
  }

  const deckPos: React.CSSProperties = { top: DECK_TOP, right: T.bell.right, width: T.card.width };

  return (
    <div ref={wrapRef}>
      <style>{KEYFRAMES}</style>
      <button
        type="button"
        aria-label="Notifications"
        onClick={toggle}
        className={cn(
          "absolute z-30 grid place-items-center rounded-full border text-foreground shadow-xs backdrop-blur-md transition-colors hover:bg-accent",
          isOpen && "bg-accent"
        )}
        style={{
          top: T.bell.top,
          right: T.bell.right,
          width: T.bell.size,
          height: T.bell.size,
          background: isOpen ? undefined : "color-mix(in oklab, var(--background) 80%, transparent)",
        }}
      >
        <Bell style={{ width: T.bell.icon, height: T.bell.icon }} />
        {len > 0 && (
          <span
            className="nf-anim absolute rounded-full"
            onAnimationEnd={() => setDotAnim(false)}
            style={{
              top: T.dot.inset,
              right: T.dot.inset + 1,
              width: T.dot.size,
              height: T.dot.size,
              background: T.dot.color,
              boxShadow: `0 0 0 ${T.dot.ring}px var(--background)`,
              animation: dotAnim ? `nfDot 180ms ${EASE_OUT}` : undefined,
            }}
          />
        )}
      </button>

      {isOpen && (
        <div
          className="nf-anim absolute z-30 origin-top-right"
          style={{
            ...deckPos,
            animation:
              phase === "closing"
                ? "nfPopOut 140ms ease-out forwards"
                : `nfPop ${T.motion.deckMs}ms ${EASE_OUT}`,
          }}
        >
          {len ? (
            <Card
              key={flipKey}
              n={unread[safeIdx]}
              len={len}
              idx={safeIdx}
              mode="deck"
              contentAnim={contentAnim}
              onX={markTop}
              onOpen={() => openItem(unread[safeIdx])}
              onFlip={flip}
            />
          ) : (
            <div
              className="border bg-popover text-center"
              style={{ borderRadius: T.card.radius, padding: `${T.card.padY + 4}px ${T.card.padX}px` }}
            >
              <div className="font-semibold" style={{ fontSize: T.text.size }}>
                You're all caught up
              </div>
              <div className="mt-1 text-sm text-muted-foreground">New notifications will show up here.</div>
            </div>
          )}
          <div className="mt-2 flex justify-end">
            <AllLink
              onClick={() => {
                close();
                navigate("/notifications");
              }}
            />
          </div>
        </div>
      )}

      {!isOpen && ctx.toast && (
        <div
          className="nf-anim absolute z-30"
          style={{
            ...deckPos,
            animation: ctx.toastLeaving
              ? `nfToastOut ${T.toast.ms}ms ease forwards`
              : `nfToastIn ${T.toast.ms}ms ease`,
          }}
        >
          <Card
            n={ctx.toast}
            len={1}
            idx={0}
            mode="toast"
            contentAnim=""
            onX={() => ctx.dismissToast(true)}
            onOpen={() => ctx.open(ctx.toast!)}
          />
        </div>
      )}
    </div>
  );
}

// ---------- expanded: the notifications page ----------
export function NotificationsPage() {
  const ctx = useNotificationsProto();
  const [tab, setTab] = useState("All");
  if (!ctx) {
    return <div className="p-8 text-muted-foreground">Select a user from the DevUI panel.</div>;
  }
  const categories = [...new Set(ctx.items.map((n) => CATEGORY[n.event]))];
  const tabs = ["All", "Unread", ...categories];
  const unreadCount = ctx.unread.length;
  const shown = ctx.items.filter(
    (n) => tab === "All" || (tab === "Unread" ? !n.read : CATEGORY[n.event] === tab)
  );
  const today = shown.filter((n) => n.minutesAgo < 60 * 24);
  const earlier = shown.filter((n) => n.minutesAgo >= 60 * 24);

  const group = (label: string, list: ProtoNotification[]) =>
    list.length ? (
      <section key={label}>
        <div className="mb-2 text-xs font-medium text-muted-foreground" style={{ marginTop: T.page.groupGap }}>
          {label}
        </div>
        <div className="overflow-hidden rounded-xl border">
          {list.map((n, i) => (
            <button
              key={n.id}
              type="button"
              onClick={() => ctx.open(n)}
              className={cn("flex w-full items-center gap-3 text-left transition-colors hover:bg-accent", i > 0 && "border-t")}
              style={{
                padding: `${T.page.rowPadY}px ${T.page.rowPadX}px`,
                background: n.read ? undefined : "color-mix(in oklab, var(--muted) 75%, transparent)",
              }}
            >
              <div className="min-w-0 flex-1">
                <Sentence parts={n.parts} size={T.page.rowText} />
              </div>
              <span className="shrink-0 text-muted-foreground" style={{ fontSize: T.text.timeSize }}>
                {timeAgo(n.minutesAgo)}
              </span>
            </button>
          ))}
        </div>
      </section>
    ) : null;

  return (
    <div style={{ padding: `28px ${T.page.pad}px` }}>
      <div className="flex items-end justify-between gap-4" style={{ paddingRight: T.bell.size + 12 }}>
        <div>
          <h1 className="font-bold tracking-tight" style={{ fontSize: T.page.title }}>
            Notifications
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadCount ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        <button
          type="button"
          onClick={ctx.markAllRead}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-3 text-[13px] font-medium transition-colors hover:bg-accent"
        >
          <CheckCheck className="size-3.5" />
          Mark all as read
        </button>
      </div>
      <div className="flex border-b" style={{ gap: T.page.tabGap, marginTop: T.page.headGap }}>
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 py-2 font-medium transition-colors",
              tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            style={{ fontSize: T.page.tabSize }}
          >
            {t}
            {t === "Unread" && unreadCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>
      {group("Today", today)}
      {group("Earlier", earlier)}
      {shown.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">Nothing in this tab.</div>
      )}
    </div>
  );
}

// ---------- prototype-only control bar ----------
export function NotificationsPrototypeBar() {
  const ctx = useNotificationsProto();
  if (!ctx || process.env.NODE_ENV === "production") return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-700 px-3 py-1.5 text-sm text-white shadow-xl ring-2 ring-fuchsia-300">
      <span className="font-medium">PROTOTYPE notifications</span>
      <span className="h-5 w-px bg-white/30" />
      <button onClick={ctx.simulate} className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">
        <Zap className="size-3.5" /> Simulate event
      </button>
      <button onClick={ctx.reset} className="rounded-full px-2 py-1 hover:bg-white/20">
        Reset
      </button>
      <span className="text-xs text-white/80">
        {ctx.unread.length} unread / {ctx.items.length}
        {ctx.lastEvent && ` · last: ${ctx.lastEvent}`}
      </span>
    </div>
  );
}
