#!/usr/bin/env python3
"""
Extract cities.json from UN World Urbanization Prospects 2025 data.

Source: GHS-WUP-MTUC R2025A (UN WUP 2025 + EU JRC), downloadable from:
  https://human-settlement.emergency.copernicus.eu/GHSWUPDownload.php
  Direct zip: https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_WUP_MTUC_GLOBE_R2025A/V1-1/GHS_WUP_MTUC_GLOBE_R2025A_V1_1_statistics.zip

Methodology: contiguous urban land at >=1,500 persons/km^2, satellite-derived
(Global Human Settlement Layer). Single consistent definition globally - not
national administrative boundaries.

Output set is the union of: every city with population >= 500,000; each
country's single most-populous city (any size); and every national capital
(any size).

Usage:
  pip install openpyxl
  python3 scripts/extract-cities-wup.py path/to/GHS_WUP_MTUC_MT_GLOBE_R2025A_v1_1.xlsx

Writes src/lib/data/cities.json.
"""

import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("Error: openpyxl is required. Install with: pip install openpyxl")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "src" / "lib" / "data" / "cities.json"
COUNTRIES_PATH = ROOT / "src" / "lib" / "data" / "countries.json"

YEAR = 2025
POP_THRESHOLD = 500_000

# Normalize UN long-form country names to common English.
COUNTRY_MAP = {
    "United States of America": "United States",
    "Russian Federation": "Russia",
    "Republic of Korea": "South Korea",
    "Dem. People's Republic of Korea": "North Korea",
    "Iran (Islamic Republic of)": "Iran",
    "Bolivia (Plurinational State of)": "Bolivia",
    "Venezuela (Bolivarian Republic of)": "Venezuela",
    "Syrian Arab Republic": "Syria",
    "Türkiye": "Turkey",
    "Viet Nam": "Vietnam",
    "United Republic of Tanzania": "Tanzania",
    "China, Hong Kong SAR": "Hong Kong",
    "China, Macao SAR": "Macau",
    "China, Taiwan Province of China": "Taiwan",
    "Democratic Republic of the Congo": "DR Congo",
    "Côte d'Ivoire": "Ivory Coast",
    "Congo": "Republic of the Congo",
}

# M49 numeric -> ISO_A3 overrides for codes absent from countries.json
# (French overseas departments folded into FR by Natural Earth, plus Kosovo
# and Gibraltar which carry -99 / no feature). Standard ISO 3166-1 alpha-3.
M49_OVERRIDE: dict[int, str] = {
    175: "MYT",  # Mayotte
    254: "GUF",  # French Guiana
    292: "GIB",  # Gibraltar
    412: "XKX",  # Kosovo (UNSC res. 1244)
    474: "MTQ",  # Martinique
    638: "REU",  # Réunion
}


def build_m49_to_iso3() -> dict[int, str]:
    """Build M49 (numeric) -> ISO_A3 map from countries.json."""
    data = json.loads(COUNTRIES_PATH.read_text())
    mapping: dict[int, str] = {}
    for feat in data["features"]:
        props = feat["properties"]
        numeric = props.get("ISO_N3_EH")
        if numeric in (None, "-99"):
            numeric = props.get("ISO_N3")
        a3 = props.get("ISO_A3_EH")
        if a3 in (None, "-99"):
            a3 = props.get("ISO_A3")
        if numeric in (None, "-99") or a3 in (None, "-99"):
            continue
        try:
            n = int(numeric)
        except (TypeError, ValueError):
            continue
        mapping[n] = a3
    mapping.update(M49_OVERRIDE)
    return mapping


def english_name(name: str) -> str:
    """For names like 'Tōkyō (Tokyo)', return the parenthesized form."""
    if "(" in name and ")" in name:
        return name[name.find("(") + 1 : name.find(")")].strip()
    return name.strip()


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    m49_to_iso3 = build_m49_to_iso3()

    xlsx_path = Path(sys.argv[1])
    print(f"Reading {xlsx_path}...")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb["UC_STATS"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {h: i for i, h in enumerate(header)}

    # First pass: collect all resolved 2025 rows; track unmatched M49 codes.
    resolved = []  # list of (row, iso3, pop, is_capital)
    unmatched: dict[int, str] = {}  # M49 -> UNLocName
    for row in rows:
        if row[col["Year"]] != YEAR:
            continue
        m49_raw = row[col["UNLocID"]]
        try:
            m49 = int(m49_raw)
        except (TypeError, ValueError):
            unmatched[m49_raw] = row[col["UNLocName"]]
            continue
        iso3 = m49_to_iso3.get(m49)
        if iso3 is None:
            unmatched[m49] = row[col["UNLocName"]]
            continue
        pop = row[col["POP"]]
        if pop is None:
            continue
        is_capital = bool(int(row[col["CapitalFlag"]]))
        resolved.append((row, iso3, pop, is_capital))

    if unmatched:
        print("ERROR: unmatched M49 codes (no ISO_A3 resolution):")
        for code, name in sorted(unmatched.items(), key=lambda kv: str(kv[0])):
            print(f"  {code!r}: {name!r}")
        raise SystemExit(1)

    # Determine each country's most-populous row.
    top_by_country: dict[str, tuple] = {}
    for entry in resolved:
        _, iso3, pop, _ = entry
        cur = top_by_country.get(iso3)
        if cur is None or pop > cur[2]:
            top_by_country[iso3] = entry

    top_ids = {id(top_by_country[iso3]) for iso3 in top_by_country}

    # Build output set: union of (a) >= threshold, (b) country top, (c) capital.
    selected = []
    for entry in resolved:
        _, _, pop, is_capital = entry
        if pop >= POP_THRESHOLD or is_capital or id(entry) in top_ids:
            selected.append(entry)

    # Dedupe by (code, english_name), keeping the most-populous of any
    # same-named cities in the same country (sort desc so first-seen == largest).
    selected.sort(key=lambda e: -e[2])
    cities = []
    seen = set()
    for row, iso3, pop, is_capital in selected:
        name = english_name(row[col["UCname"]])
        key = (iso3, name)
        if key in seen:
            continue
        seen.add(key)
        cities.append({
            "name": name,
            "country": COUNTRY_MAP.get(row[col["UNLocName"]], row[col["UNLocName"]]),
            "code": iso3,
            "population": int(round(pop)),
            "isCapital": is_capital,
            "lat": round(row[col["Lat"]], 4),
            "lon": round(row[col["Lon"]], 4),
        })

    cities.sort(key=lambda c: -c["population"])

    OUTPUT_PATH.write_text(
        json.dumps(cities, ensure_ascii=False, separators=(",", ":"))
    )
    print(f"Wrote {len(cities)} cities to {OUTPUT_PATH}")

    codes = {c["code"] for c in cities}
    pops = [c["population"] for c in cities]
    capitals = sum(1 for c in cities if c["isCapital"])
    print(f"  total cities:      {len(cities)}")
    print(f"  distinct countries:{len(codes)}")
    print(f"  capitals:          {capitals}")
    print(f"  min population:    {min(pops)}")
    print(f"  max population:    {max(pops)}")


if __name__ == "__main__":
    main()
