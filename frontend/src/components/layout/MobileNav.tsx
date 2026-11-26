import { NavLink } from "react-router-dom";
import { ChartNoAxesColumn, History, LayoutGrid, SlidersHorizontal, Timer } from "lucide-react";

const ITEMS = [
  { to: "/", label: "Overview", icon: LayoutGrid },
  { to: "/focus", label: "Focus", icon: Timer },
  { to: "/history", label: "History", icon: History },
  { to: "/analytics", label: "Analytics", icon: ChartNoAxesColumn },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export function MobileNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              [
                "flex flex-col items-center gap-1 py-2.5 text-[10px] transition-colors",
                isActive ? "text-accent" : "text-muted hover:text-ink",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.7} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
