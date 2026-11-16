// PROTOTYPE — throwaway floating bar for flipping between UI variants.
// Lives on branch prototype/notification-ui only. Never merge.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PrototypeSwitcher({
  variants,
  current,
  children,
}: {
  variants: { key: string; name: string }[];
  current: string;
  children?: React.ReactNode;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const index = Math.max(0, variants.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = variants[(index + delta + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-700 px-2 py-1.5 text-sm text-white shadow-xl ring-2 ring-fuchsia-300">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/20" title="Previous variant (←)">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-44 text-center font-medium">
        PROTOTYPE {variants[index].key} ({variants[index].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/20" title="Next variant (→)">
        <ChevronRight className="size-4" />
      </button>
      {children}
    </div>
  );
}
