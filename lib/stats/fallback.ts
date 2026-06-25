import type { RaceRaw } from "./types";

/**
 * The first default "stat battle": World's largest economies by GDP. Used as the
 * instant offline fallback (no API key / error) so /stats always renders. These
 * are accepted approximate nominal-GDP figures in US$ trillions — the live brain
 * (Sonnet) produces richer/fresher data for real requests.
 */
export const GDP_FALLBACK: RaceRaw = {
  title: "World's Largest Economies",
  subtitle: "Nominal GDP, 1960 – 2026",
  valueLabel: "GDP",
  unitPrefix: "$",
  unitSuffix: "T",
  timeLabel: "Year",
  entities: [
    { name: "United States", color: "#3C6FE0" },
    { name: "China", color: "#E0322F" },
    { name: "Japan", color: "#E84393" },
    { name: "Germany", color: "#2C3E50" },
    { name: "United Kingdom", color: "#9B59B6" },
    { name: "India", color: "#F39C12" },
    { name: "France", color: "#16A085" },
    { name: "Italy", color: "#27AE60" },
    { name: "Russia", color: "#7F8C8D" },
    { name: "Brazil", color: "#F1C40F" },
  ],
  keyframes: [
    { time: 1960, values: [
      { name: "United States", value: 0.54 }, { name: "Russia", value: 0.3 }, { name: "Germany", value: 0.09 },
      { name: "United Kingdom", value: 0.073 }, { name: "France", value: 0.062 }, { name: "China", value: 0.06 },
      { name: "Japan", value: 0.044 }, { name: "Italy", value: 0.04 }, { name: "India", value: 0.037 }, { name: "Brazil", value: 0.015 },
    ] },
    { time: 1980, values: [
      { name: "United States", value: 2.86 }, { name: "Japan", value: 1.1 }, { name: "Russia", value: 0.94 },
      { name: "Germany", value: 0.95 }, { name: "France", value: 0.7 }, { name: "United Kingdom", value: 0.6 },
      { name: "Italy", value: 0.46 }, { name: "Brazil", value: 0.24 }, { name: "China", value: 0.19 }, { name: "India", value: 0.19 },
    ] },
    { time: 2000, values: [
      { name: "United States", value: 10.25 }, { name: "Japan", value: 4.97 }, { name: "Germany", value: 1.95 },
      { name: "United Kingdom", value: 1.66 }, { name: "France", value: 1.36 }, { name: "China", value: 1.21 },
      { name: "Italy", value: 1.14 }, { name: "Brazil", value: 0.65 }, { name: "India", value: 0.47 }, { name: "Russia", value: 0.26 },
    ] },
    { time: 2010, values: [
      { name: "United States", value: 15.05 }, { name: "China", value: 6.09 }, { name: "Japan", value: 5.76 },
      { name: "Germany", value: 3.4 }, { name: "France", value: 2.65 }, { name: "United Kingdom", value: 2.49 },
      { name: "Brazil", value: 2.21 }, { name: "Italy", value: 2.13 }, { name: "India", value: 1.68 }, { name: "Russia", value: 1.52 },
    ] },
    { time: 2020, values: [
      { name: "United States", value: 21.06 }, { name: "China", value: 14.69 }, { name: "Japan", value: 5.04 },
      { name: "Germany", value: 3.89 }, { name: "United Kingdom", value: 2.7 }, { name: "India", value: 2.67 },
      { name: "France", value: 2.64 }, { name: "Italy", value: 1.89 }, { name: "Russia", value: 1.49 }, { name: "Brazil", value: 1.45 },
    ] },
    { time: 2026, values: [
      { name: "United States", value: 30.3 }, { name: "China", value: 19.5 }, { name: "Germany", value: 4.9 },
      { name: "Japan", value: 4.4 }, { name: "India", value: 4.3 }, { name: "United Kingdom", value: 3.7 },
      { name: "France", value: 3.3 }, { name: "Italy", value: 2.5 }, { name: "Brazil", value: 2.3 }, { name: "Russia", value: 2.2 },
    ] },
  ],
};
