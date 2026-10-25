import { expect, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";

import { ProductDescription } from "../product-description";

/**
 * The product's description keeps its structure (SHO-154): headings are
 * headings to a screen reader, list items read on their own, and the bullet
 * or number beside each is decoration.
 */

const html =
  "<p>One tub holds 30 servings.</p>" +
  "<h3>Choose your flavour</h3>" +
  "<ul><li>Vanilla</li><li>Chocolate</li></ul>" +
  "<ol><li>Add a scoop</li><li>Shake</li></ol>";

test("headings, paragraphs and lists come through as themselves", async () => {
  await render(<ProductDescription html={html} />);

  expect(screen.getByRole("header", { name: "Choose your flavour" })).toBeTruthy();
  expect(screen.getByText("One tub holds 30 servings.")).toBeTruthy();
  for (const item of ["Vanilla", "Chocolate", "Add a scoop", "Shake"]) {
    expect(screen.getByText(item)).toBeTruthy();
  }
});

test("bullets and numbers are hidden from screen readers", async () => {
  await render(<ProductDescription html={html} />);

  // Hidden elements are left out of queries unless asked for.
  expect(screen.queryByText("•")).toBeNull();
  expect(screen.getAllByText("•", { includeHiddenElements: true })).toHaveLength(2);
  expect(screen.getByText("2.", { includeHiddenElements: true })).toBeTruthy();
});

test("an empty description renders nothing", async () => {
  await render(<ProductDescription html="" />);
  expect(screen.toJSON()).toBeNull();
});
