import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalWholeNumber, parseForm, percentToFraction, randAmount } from "./forms";

const amount = randAmount("Rate");
const parseAmount = (v: string) => amount.safeParse(v);

describe("randAmount", () => {
  it("keeps amounts as exact decimal strings", () => {
    expect(parseAmount("652.25")).toMatchObject({ success: true, data: "652.25" });
    expect(parseAmount("R 59 000")).toMatchObject({ success: true, data: "59000" });
    expect(parseAmount("r59,000.00")).toMatchObject({ success: true, data: "59000.00" });
  });

  it("rejects more than 2 decimals, zero, negatives and text", () => {
    for (const bad of ["652.255", "0", "0.00", "-5", "abc", "", "1.2.3"]) {
      expect(parseAmount(bad).success, bad).toBe(false);
    }
  });
});

describe("percentToFraction", () => {
  it("converts percentages without floating-point drift", () => {
    expect(percentToFraction("15")).toBe("0.1500");
    expect(percentToFraction("2.5")).toBe("0.0250");
    expect(percentToFraction("15.25")).toBe("0.1525");
    expect(percentToFraction("0.01")).toBe("0.0001");
  });
});

describe("parseForm", () => {
  const schema = z.object({ terms: optionalWholeNumber("Payment terms", 0, 365) });
  const form = (terms: string) => {
    const fd = new FormData();
    fd.set("terms", terms);
    return fd;
  };

  it("turns empty optional numbers into null", () => {
    expect(parseForm(schema, form(" "))).toEqual({ data: { terms: null } });
    expect(parseForm(schema, form("30"))).toEqual({ data: { terms: 30 } });
  });

  it("reports the first problem per field", () => {
    expect(parseForm(schema, form("400")).error?.fieldErrors).toEqual({
      terms: "Payment terms must be between 0 and 365.",
    });
    expect(parseForm(schema, form("3.5")).error?.fieldErrors).toEqual({
      terms: "Payment terms must be a whole number.",
    });
  });
});
