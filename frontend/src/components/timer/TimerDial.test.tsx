import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimerDial } from "./TimerDial";

describe("TimerDial", () => {
  it("shows focused time derived from seconds", () => {
    render(
      <TimerDial
        focusedSeconds={1525}
        progress={0.5}
        status="ACTIVE"
        title="Rewrite the engine"
        categoryName="Programming"
        categoryColor="#62DCEB"
        targetSeconds={3000}
      />
    );
    expect(screen.getByText("25:25")).toBeInTheDocument();
    expect(screen.getByText("Rewrite the engine")).toBeInTheDocument();
    expect(screen.getByText(/Programming/)).toBeInTheDocument();
  });

  it("labels a paused session for screen readers", () => {
    render(
      <TimerDial
        focusedSeconds={60}
        progress={0.1}
        status="PAUSED"
        title="Reading"
        categoryName={null}
        categoryColor={null}
        targetSeconds={null}
      />
    );
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.getByText(/Uncategorized/)).toBeInTheDocument();
    expect(screen.getByText(/Paused\. 1 minutes of focused time\./)).toBeInTheDocument();
  });
});
