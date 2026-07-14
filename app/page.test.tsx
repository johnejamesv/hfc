import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("renders the mobile playground shell", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Find a matching pair" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Editor controls" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Voice transcript status" })).toHaveTextContent("idle");
  });
});
