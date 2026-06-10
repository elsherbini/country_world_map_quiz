#!/usr/bin/env python3
"""
Extract cities.json from UN World Urbanization Prospects 2025 data.

Source: GHS-WUP-MTUC R2025A (UN WUP 2025 + EU JRC), downloadable from:
  https://human-settlement.emergency.copernicus.eu/GHSWUPDownload.php
  Direct zip: https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_WUP_MTUC_GLOBE_R2025A/V1-1/GHS_WUP_MTUC_GLOBE_R2025A_V1_1_statistics.zip

Methodology: contiguous urban land at >=1,500 persons/km^2, satellite-derived
(Global Human Settlement Layer). Single consistent definition globally - not
national administrative boundaries.

Output set is every 2025 urban centre with population >= 50,000 and a valid
name. All distinct urban centres are kept (no population-based dropping);
same-named cities in the same country are emitted separately. US/India/China
cities additionally carry an `admin` (state/province) label resolved by
point-in-polygon against subdivisions.json.

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
SUBDIVISIONS_PATH = ROOT / "src" / "lib" / "data" / "subdivisions.json"

YEAR = 2025
POP_THRESHOLD = 50_000

# Countries (by ISO_A2) that get a state/province admin label.
ADMIN_ISO2 = {"US", "IN", "CN"}

# Junk UCname values to skip (case-insensitive).
JUNK_NAMES = {"n/a", "na", "nan", "none", ""}

# Sub-national / disputed-territory capitals wrongly flagged as national by GHS CapitalFlag.
# Keyed by (common country name as emitted, city name as emitted via english_name).
SUPPRESS_CAPITAL = {
    ("India", "Jammu"),
    ("India", "Srinagar"),
    ("Pakistan", "Muzaffarabad"),
    ("Pakistan", "Gilgit"),
    ("Chile", "Valparaíso"),
}

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


def english_name(name) -> str:
    """For names like 'Tōkyō (Tokyo)', return the parenthesized form."""
    if name is None:
        return ""
    name = str(name)
    if "(" in name and ")" in name:
        return name[name.find("(") + 1 : name.find(")")].strip()
    return name.strip()


def point_in_ring(lon: float, lat: float, ring) -> bool:
    """Ray-casting point-in-polygon test against a single ring."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / (yj - yi) + xi
        ):
            inside = not inside
        j = i
    return inside


def exterior_rings(geometry):
    """Yield exterior rings for a Polygon or MultiPolygon (holes ignored)."""
    gtype = geometry["type"]
    coords = geometry["coordinates"]
    if gtype == "Polygon":
        # coords = [exterior, *holes]
        yield coords[0]
    elif gtype == "MultiPolygon":
        # coords = [[exterior, *holes], ...]
        for poly in coords:
            yield poly[0]


def build_subdivisions():
    """Build [(iso_a2, name, [(ring, (minlon,minlat,maxlon,maxlat)), ...]), ...]
    for US/IN/CN subdivisions, with a per-ring bbox for prefiltering."""
    data = json.loads(SUBDIVISIONS_PATH.read_text())
    subs = []
    for feat in data["features"]:
        props = feat["properties"]
        iso2 = props.get("iso_a2")
        if iso2 not in ADMIN_ISO2:
            continue
        rings = []
        for ring in exterior_rings(feat["geometry"]):
            lons = [p[0] for p in ring]
            lats = [p[1] for p in ring]
            bbox = (min(lons), min(lats), max(lons), max(lats))
            rings.append((ring, bbox))
        subs.append((iso2, props["name"], rings))
    return subs


def find_admin(lon: float, lat: float, iso2: str, subs) -> str | None:
    """Return the name of the subdivision containing (lon, lat), or None."""
    for sub_iso2, name, rings in subs:
        if sub_iso2 != iso2:
            continue
        for ring, (minlon, minlat, maxlon, maxlat) in rings:
            if lon < minlon or lon > maxlon or lat < minlat or lat > maxlat:
                continue
            if point_in_ring(lon, lat, ring):
                return name
    return None


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    m49_to_iso3 = build_m49_to_iso3()
    subs = build_subdivisions()

    # M49 numeric -> ISO_A2 for the three admin-labelled countries.
    m49_to_admin_iso2 = {840: "US", 356: "IN", 156: "CN"}

    xlsx_path = Path(sys.argv[1])
    print(f"Reading {xlsx_path}...")
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)
    ws = wb["UC_STATS"]
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    col = {h: i for i, h in enumerate(header)}

    # Single pass: emit every 2025 row with POP >= threshold and a valid name,
    # resolved to an ISO_A3 code. Each row is a distinct urban centre
    # (ID_UC_G0 is unique within 2025), so no merging is done.
    cities = []
    unmatched: dict[int, str] = {}  # M49 -> UNLocName
    admin_hit = 0
    admin_miss = 0
    for row in rows:
        if row[col["Year"]] != YEAR:
            continue
        pop = row[col["POP"]]
        if pop is None or pop < POP_THRESHOLD:
            continue
        name = english_name(row[col["UCname"]])
        if name.lower() in JUNK_NAMES:
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

        is_capital = bool(int(row[col["CapitalFlag"]]))
        country = COUNTRY_MAP.get(row[col["UNLocName"]], row[col["UNLocName"]])
        if (country, name) in SUPPRESS_CAPITAL:
            is_capital = False

        lat = round(row[col["Lat"]], 4)
        lon = round(row[col["Lon"]], 4)

        city = {
            "name": name,
            "country": country,
            "code": iso3,
            "id": int(row[col["ID_UC_G0"]]),
            "population": int(round(pop)),
            "isCapital": is_capital,
            "lat": lat,
            "lon": lon,
        }

        admin_iso2 = m49_to_admin_iso2.get(m49)
        if admin_iso2 is not None:
            admin = find_admin(lon, lat, admin_iso2, subs)
            if admin is not None:
                city["admin"] = admin
                admin_hit += 1
            else:
                admin_miss += 1

        cities.append(city)

    if unmatched:
        print("ERROR: unmatched M49 codes (no ISO_A3 resolution):")
        for code, name in sorted(unmatched.items(), key=lambda kv: str(kv[0])):
            print(f"  {code!r}: {name!r}")
        raise SystemExit(1)

    cities.sort(key=lambda c: -c["population"])

    OUTPUT_PATH.write_text(
        json.dumps(cities, ensure_ascii=False, separators=(",", ":"))
    )
    print(f"Wrote {len(cities)} cities to {OUTPUT_PATH}")

    codes = {c["code"] for c in cities}
    pops = [c["population"] for c in cities]
    capitals = sum(1 for c in cities if c["isCapital"])
    print(f"  total cities:       {len(cities)}")
    print(f"  distinct countries: {len(codes)}")
    print(f"  capitals:           {capitals}")
    print(f"  min population:     {min(pops)}")
    print(f"  max population:     {max(pops)}")
    print(f"  US/IN/CN with admin:{admin_hit}")
    print(f"  US/IN/CN no admin:  {admin_miss}")


if __name__ == "__main__":
    main()
