from __future__ import annotations

import argparse
import json

from server import PROVIDERS, catalog_payload

PROVIDER_LABELS = {specification["id"]: specification["label"] for specification in PROVIDERS}


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="List local AI agent configuration files.")
    parser.add_argument("command", nargs="?", default="list", choices=["list"])
    parser.add_argument("--provider", choices=sorted(PROVIDER_LABELS), help="Filter to one provider.")
    parser.add_argument("--json", action="store_true", help="Output the catalog as JSON.")
    return parser.parse_args()


def render_text(results: list[dict[str, object]]) -> None:
    for result in results:
        label = PROVIDER_LABELS[result["providerId"]]
        print(f"[{label}] {result['status']}")
        if result["status"] != "ok":
            continue
        entries = result["fileEntries"]
        if not entries:
            print("  (対象ファイルなし)")
            continue
        for entry in entries:
            print(f"  {entry['categoryName']}: {entry['relativePath']}")


def main() -> None:
    arguments = parse_arguments()
    results = catalog_payload()["providerResults"]
    if arguments.provider:
        results = [result for result in results if result["providerId"] == arguments.provider]
    if arguments.json:
        print(json.dumps({"providerResults": results}, ensure_ascii=False, indent=2))
    else:
        render_text(results)


if __name__ == "__main__":
    main()
