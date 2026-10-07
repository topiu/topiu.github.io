// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumField } from "../src/ui/atoms";

/* A parent that clamps like the ceiling height does (800–8000). */
function Clamped({ onCommit, initial = 2400 }) {
  const [v, setV] = useState(initial);
  return (
    <NumField
      label="Ceiling height"
      value={v}
      onChange={(x) => {
        onCommit(x);
        setV(Math.max(800, Math.min(8000, x)));
      }}
    />
  );
}
const typeInto = (input, text) => {
  let s = "";
  for (const ch of text) {
    s += ch;
    fireEvent.change(input, { target: { value: s } });
  }
};

describe("NumField (review finding 3)", () => {
  afterEach(cleanup);

  it("does not commit while typing, then commits the whole number once", () => {
    const onCommit = vi.fn();
    const { container } = render(<Clamped onCommit={onCommit} />);
    const input = container.querySelector("input");
    fireEvent.change(input, { target: { value: "" } });
    typeInto(input, "2600");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("2600"); // the box was not reset to a clamped value mid-typing
    fireEvent.blur(input);
    expect(onCommit.mock.calls).toEqual([[2600]]);
    expect(input.value).toBe("2600");
  });

  it("shows what the parent stored when it clamps the value", () => {
    const { container } = render(<Clamped onCommit={() => {}} />);
    const input = container.querySelector("input");
    typeInto(input, "90000");
    fireEvent.blur(input);
    expect(input.value).toBe("8000");
  });

  it("shows the stored value even when the clamp leaves it unchanged", () => {
    const { container } = render(<Clamped onCommit={() => {}} initial={8000} />);
    const input = container.querySelector("input");
    typeInto(input, "99999");
    fireEvent.blur(input);
    expect(input.value).toBe("8000");
  });

  it("commits on Enter", () => {
    const onCommit = vi.fn();
    const { container } = render(<Clamped onCommit={onCommit} />);
    const input = container.querySelector("input");
    input.focus();
    typeInto(input, "3100");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit.mock.calls).toEqual([[3100]]);
  });

  it("commits when it is removed mid-edit, which sends no blur", () => {
    const onCommit = vi.fn();
    const { container, unmount } = render(<Clamped onCommit={onCommit} />);
    typeInto(container.querySelector("input"), "2700");
    act(() => unmount());
    expect(onCommit.mock.calls).toEqual([[2700]]);
  });

  it("does nothing on blur when nothing was typed", () => {
    const onCommit = vi.fn();
    const { container } = render(<Clamped onCommit={onCommit} />);
    fireEvent.blur(container.querySelector("input"));
    expect(onCommit).not.toHaveBeenCalled();
  });
});
