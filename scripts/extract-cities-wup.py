#!/usr/bin/env python3
"""
Extract cities.json from UN World Urbanization Prospects 2025 data.

Source: GHS-WUP-MTUC R2025A (UN WUP 2025 + EU JRC), downloadable from:
  https://human-settlement.emergency.copernicus.eu/GHSWUPDownload.php
  Direct zip: https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_WUP_MTUC_GLOBE_R2025A/V1-1/GHS_WUP_MTUC_GLOBE_R2025A_V1_1_statistics.zip

Methodology: contiguous urban land at >=1,500 persons/km^2, satellite-derived
(Global Human Settlement Layer). Single consistent definition globally - not
national administrative boundaries.

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

YEAR = 2025
POP_THRESHOLD = 2_000_000

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

# Country -> continent. Covers every country in the 2M+ filtered set.
COUNTRY_CONTINENT = {
    "Afghanistan": "Asia", "Algeria": "Africa", "Angola": "Africa",
    "Argentina": "South America", "Australia": "Oceania", "Austria": "Europe",
    "Bangladesh": "Asia", "Benin": "Africa", "Bolivia": "South America",
    "Brazil": "South America", "Burkina Faso": "Africa", "Cambodia": "Asia",
    "Cameroon": "Africa", "Canada": "North America", "Chile": "South America",
    "China": "Asia", "Colombia": "South America", "Costa Rica": "North America",
    "Dominican Republic": "North America", "DR Congo": "Africa",
    "Ecuador": "South America", "Egypt": "Africa", "Ethiopia": "Africa",
    "France": "Europe", "Germany": "Europe", "Ghana": "Africa", "Greece": "Europe",
    "Guatemala": "North America", "Guinea": "Africa", "Hong Kong": "Asia",
    "India": "Asia", "Indonesia": "Asia", "Iran": "Asia", "Iraq": "Asia",
    "Israel": "Asia", "Italy": "Europe", "Ivory Coast": "Africa", "Japan": "Asia",
    "Jordan": "Asia", "Kazakhstan": "Asia", "Kenya": "Africa", "Kuwait": "Asia",
    "Macau": "Asia", "Madagascar": "Africa", "Malaysia": "Asia", "Mali": "Africa",
    "Mexico": "North America", "Morocco": "Africa", "Mozambique": "Africa",
    "Myanmar": "Asia", "Nepal": "Asia", "Nigeria": "Africa",
    "North Korea": "Asia", "Pakistan": "Asia", "Peru": "South America",
    "Philippines": "Asia", "Qatar": "Asia", "Republic of the Congo": "Africa",
    "Russia": "Europe", "Saudi Arabia": "Asia", "Senegal": "Africa",
    "Singapore": "Asia", "Somalia": "Africa", "South Africa": "Africa",
    "South Korea": "Asia", "Spain": "Europe", "Sri Lanka": "Asia",
    "Sudan": "Africa", "Syria": "Asia", "Taiwan": "Asia", "Tanzania": "Africa",
    "Thailand": "Asia", "Togo": "Africa", "Tunisia": "Africa", "Turkey": "Asia",
    "Uganda": "Africa", "Ukraine": "Europe", "United Arab Emirates": "Asia",
    "United Kingdom": "Europe", "United States": "North America",
    "Uzbekistan": "Asia", "Venezuela": "South America", "Vietnam": "Asia",
    "Yemen": "Asia", "Zambia": "Africa", "Zimbabwe": "Africa",
}


def english_name(name: str) -> str:
    """For names like 'Tōkyō (Tokyo)', return the parenthesized form."""
    if "(" in name and ")" in name:
        return name[name.find("(") + 1 : name.find(")")].strip()
    return name.strip()


def tier_for(pop: int) -> str:
    if pop >= 25_000_000: return ">25M"
    if pop >= 15_000_000: return "15-25M"
    if pop >= 5_000_000: return "5-15M"
    return "2-5M"


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    xlsx_path = Path(sys.argv[1])
    print(f"Reading {xlsx_path}...")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb["UC_STATS"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {h: i for i, h in enumerate(header)}

    cities = []
    for row in rows:
        if row[col["Year"]] != YEAR:
            continue
        pop = row[col["POP"]]
        if pop is None or pop < POP_THRESHOLD:
            continue

        country = COUNTRY_MAP.get(row[col["UNLocName"]], row[col["UNLocName"]])
        continent = COUNTRY_CONTINENT.get(country)
        if not continent:
            raise SystemExit(f"Unmapped country: {country!r}")

        cities.append({
            "name": english_name(row[col["UCname"]]),
            "country": country,
            "population": int(round(pop)),
            "continent": continent,
            "populationTier": tier_for(pop),
            "lat": round(row[col["Lat"]], 4),
            "lon": round(row[col["Lon"]], 4),
        })

    cities.sort(key=lambda c: -c["population"])

    OUTPUT_PATH.write_text(
        json.dumps(cities, ensure_ascii=False, separators=(",", ":"))
    )
    print(f"Wrote {len(cities)} cities to {OUTPUT_PATH}")

    from collections import Counter
    print("Tiers:", dict(Counter(c["populationTier"] for c in cities)))
    print("Continents:", dict(Counter(c["continent"] for c in cities)))


if __name__ == "__main__":
    main()
