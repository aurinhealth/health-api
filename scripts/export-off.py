# Projects the Open Food Facts Parquet export to the few fields the world food
# catalogue needs, as gzip NDJSON (one product per line):
#   python -I scripts/export-off.py <out.ndjson.gz> [parquet url or path]
# Runs in .github/workflows/food-catalog-refresh.yml (pip install duckdb), which
# downloads the 8 GB file first: Hugging Face rate-limits the many ranged
# requests DuckDB makes for a URL (HTTP 429 on GitHub's runners).
# scripts/refresh-world-foods.mjs reads the result.
import sys
import duckdb

URL = "https://huggingface.co/datasets/openfoodfacts/product-database/resolve/main/food.parquet"
NUTRIENTS = ["energy-kcal", "energy", "proteins", "carbohydrates", "fat", "fiber", "sugars", "salt"]

def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python -I scripts/export-off.py <out.ndjson.gz> [parquet]")
    out, src = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else URL)
    con = duckdb.connect()
    if src.startswith("http"):
        con.execute("INSTALL httpfs; LOAD httpfs;")
    # The runner has 16 GB; DuckDB would otherwise take most of it.
    con.execute("SET preserve_insertion_order = false; SET memory_limit = '6GB'")
    wanted = ", ".join("'" + n + "'" for n in NUTRIENTS)
    con.execute(f"""
      COPY (
        SELECT code, lang,
          list_filter(product_name, lambda x: x.lang IN ('main', 'cs', 'en') AND trim(coalesce(x."text", '')) <> '') AS names,
          brands, quantity, serving_size, product_quantity_unit AS unit,
          list_contains(countries_tags, 'en:czech-republic') AS cz,
          list_transform(list_filter(nutriments, lambda x: x.name IN ({wanted}) AND isfinite(x."100g")),
                         lambda x: struct_pack(k := x.name, v := x."100g")) AS n
        FROM read_parquet(?)
        WHERE NOT coalesce(obsolete, false) AND code IS NOT NULL
      ) TO '{out.replace("'", "''")}' (FORMAT json, COMPRESSION gzip)
    """, [src])
    total = con.execute(f"SELECT count(*) FROM read_json('{out.replace(chr(39), chr(39) * 2)}', format = 'newline_delimited')").fetchone()[0]
    print(f"Open Food Facts: {total} products in {out}")

if __name__ == "__main__":
    main()
