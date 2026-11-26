import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

describe("Modal", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  it("keeps focus inside the dialog when the parent re-renders", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <Modal open onClose={first} title="Interruption">
        <input aria-label="Note" />
      </Modal>
    );

    const input = screen.getByLabelText("Note");
    input.focus();
    expect(input).toHaveFocus();

    // A ticking timer re-renders the page and passes a new onClose identity.
    rerender(
      <Modal open onClose={second} title="Interruption">
        <input aria-label="Note" />
      </Modal>
    );

    expect(input).toHaveFocus();
    expect(first).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
