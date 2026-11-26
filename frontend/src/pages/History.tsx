import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Inbox, Search, SlidersHorizontal, X } from "lucide-react";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import type { Session } from "../types";
import {
  endOfDayIso,
  formatDateShort,
  formatDuration,
  formatTime,
  startOfDayIso,
} from "../utils/format";
import { SORT_OPTIONS } from "../utils/constants";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
} from "../components/common/Primitives";
import { SessionDetail } from "../components/history/SessionDetail";

const PAGE_SIZE = 10;

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "border-accent/30 text-accent",
  CANCELLED: "border-line text-muted",
  ACTIVE: "border-cyan/40 text-cyan",
  PAUSED: "border-warn/40 text-warn",
};

export function HistoryPage() {
  const { errorMessage, settings } = useApp();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("recent");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Session | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const categories = useQuery({ queryKey: ["categories"], queryFn: api.categories });

  const sessions = useQuery({
    queryKey: ["sessions", { search, categoryId, status, sort, from, to, page }],
    queryFn: () =>
      api.sessions({
        search: search || undefined,
        categoryId: categoryId || undefined,
        status: status || undefined,
        sort,
        dateFrom: from ? startOfDayIso(from) : undefined,
        dateTo: to ? endOfDayIso(to) : undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    placeholderData: (previous) => previous,
  });

  const total = sessions.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtersActive = Boolean(search || categoryId || status || from || to);

  const reset = () => {
    setSearchInput("");
    setSearch("");
    setCategoryId("");
    setStatus("");
    setFrom("");
    setTo("");
    setSort("recent");
    setPage(0);
  };

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="Every session, measured"
        description="Search, filter and inspect recorded sessions. Cancelled sessions stay visible but are excluded from focus totals."
        actions={
          <>
            <button
              type="button"
              className="btn btn-sm lg:hidden"
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
            >
              <SlidersHorizontal size={13} /> Filters
            </button>
            <Link to="/focus" className="btn btn-sm">
              New session
            </Link>
          </>
        }
      />

      <section className={`panel mb-4 p-4 ${showFilters ? "" : "hidden lg:block"}`}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_auto]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <label htmlFor="history-search" className="sr-only">
              Search sessions
            </label>
            <input
              id="history-search"
              className="field pl-9"
              placeholder="Search by session name"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="history-category" className="sr-only">
              Filter by category
            </label>
            <select
              id="history-category"
              className="field"
              value={categoryId}
              onChange={(event) => {
                setCategoryId(event.target.value);
                setPage(0);
              }}
            >
              <option value="">All categories</option>
              {categories.data?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="history-status" className="sr-only">
              Filter by status
            </label>
            <select
              id="history-status"
              className="field"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="">Any status</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label htmlFor="history-sort" className="sr-only">
              Sort sessions
            </label>
            <select
              id="history-sort"
              className="field"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label htmlFor="history-from" className="label">
              From
            </label>
            <input
              id="history-from"
              type="date"
              className="field"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <div>
            <label htmlFor="history-to" className="label">
              To
            </label>
            <input
              id="history-to"
              type="date"
              className="field"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(0);
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn"
              onClick={reset}
              disabled={!filtersActive && sort === "recent"}
            >
              <X size={13} /> Clear
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
          <p className="text-[11px] text-muted">
            {sessions.isFetching ? "Refreshing…" : `${total} session${total === 1 ? "" : "s"}`}
            {filtersActive && " matching these filters"}
          </p>
          <p className="text-[10px] text-muted">
            Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
        </div>
      </section>

      <div className="panel overflow-hidden">
        {sessions.isLoading ? (
          <LoadingBlock label="Loading history" />
        ) : sessions.isError ? (
          <div className="p-4">
            <ErrorState
              message={errorMessage(sessions.error)}
              onRetry={() => void sessions.refetch()}
            />
          </div>
        ) : (sessions.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Inbox size={17} />}
            title={filtersActive ? "No sessions match these filters" : "No sessions recorded yet"}
            description={
              filtersActive
                ? "Try widening the date range or clearing the search."
                : "Your completed and cancelled sessions will be listed here."
            }
          >
            {filtersActive ? (
              <button type="button" className="btn btn-sm" onClick={reset}>
                Clear filters
              </button>
            ) : (
              <Link to="/focus" className="btn btn-sm btn-primary">
                Start a session
              </Link>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {["Session", "Date", "Start", "End", "Focused", "Interrupted", "Status", ""].map(
                      (heading) => (
                        <th key={heading} scope="col" className="micro px-4 py-2.5 font-normal">
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {sessions.data?.items.map((session) => (
                    <tr
                      key={session.id}
                      className="cursor-pointer transition-colors hover:bg-surface/40"
                      onClick={() => setSelected(session)}
                    >
                      <td className="max-w-[240px] px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: session.category?.color ?? "var(--muted)" }}
                          />
                          <span className="truncate text-[13px]">{session.title}</span>
                        </div>
                        <p className="mt-0.5 truncate pl-3.5 text-[10px] text-muted">
                          {session.category?.name ?? "Uncategorized"}
                          {session.isDemo && " · demo"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
                        {formatDateShort(session.startedAt)}
                      </td>
                      <td className="numeral whitespace-nowrap px-4 py-3 text-[12px]">
                        {formatTime(session.startedAt)}
                      </td>
                      <td className="numeral whitespace-nowrap px-4 py-3 text-[12px] text-muted">
                        {formatTime(session.endedAt)}
                      </td>
                      <td className="numeral whitespace-nowrap px-4 py-3 text-[12px]">
                        {formatDuration(session.focusedSeconds)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-muted">
                        {session.interruptionCount > 0
                          ? `${formatDuration(session.interruptedSeconds)} (${session.interruptionCount})`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`chip ${STATUS_STYLES[session.status] ?? ""}`}
                        >
                          {session.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] text-muted">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-hairline md:hidden">
              {sessions.data?.items.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-left"
                    onClick={() => setSelected(session)}
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: session.category?.color ?? "var(--muted)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-[13px]">{session.title}</span>
                        <span className="numeral text-[12px]">
                          {formatDuration(session.focusedSeconds)}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted">
                        <span>
                          {formatDateShort(session.startedAt)} · {formatTime(session.startedAt)}
                        </span>
                        <span className="uppercase tracking-micro">{session.status.toLowerCase()}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-muted">
            Page {page + 1} of {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page + 1 >= pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {settings && (
        <p className="mt-4 text-center text-[10px] text-muted">
          Deleting a session removes its interruptions too. Demo sessions are clearly marked and can
          be removed in bulk from Settings.
        </p>
      )}

      <SessionDetail session={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
