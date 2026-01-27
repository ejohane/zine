#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import List, Optional


def parse_duration(value: str) -> dt.timedelta:
    match = re.match(r"^(\d+)([smhd])$", value.strip())
    if not match:
        raise ValueError("Duration must be like 15m, 2h, 1d")
    amount = int(match.group(1))
    unit = match.group(2)
    if unit == "s":
        return dt.timedelta(seconds=amount)
    if unit == "m":
        return dt.timedelta(minutes=amount)
    if unit == "h":
        return dt.timedelta(hours=amount)
    return dt.timedelta(days=amount)


def parse_iso(value: str) -> dt.datetime:
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    parsed = dt.datetime.fromisoformat(cleaned)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def format_time(value: dt.datetime, mode: str) -> str:
    if mode == "unix":
        return str(int(value.timestamp()))
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def read_env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return default
    return value


def get_value(record: dict, keys: List[str]) -> Optional[str]:
    for key in keys:
        if key in record:
            value = record[key]
            return str(value) if value is not None else None
    return None


def parse_records(payload: str) -> List[dict]:
    if not payload.strip():
        return []
    try:
        data = json.loads(payload)
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(data, dict):
            return [data]
    except json.JSONDecodeError:
        pass
    records = []
    for line in payload.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            records.append(parsed)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Pull Cloudflare Workers logs via Logpull"
    )
    parser.add_argument("--since", help="Duration like 15m, 2h, 1d")
    parser.add_argument("--from", dest="start", help="RFC3339 start time")
    parser.add_argument("--to", dest="end", help="RFC3339 end time")
    parser.add_argument("--ray", help="Filter by Ray ID")
    parser.add_argument("--worker", help="Filter by worker/script name")
    parser.add_argument("--status", help="Filter by status/edge status")
    parser.add_argument("--path", help="Filter by path or URL substring")
    parser.add_argument("--contains", help="Substring search in log record")
    parser.add_argument("--fields", help="Comma list of fields")
    parser.add_argument("--dataset", help="Override dataset")
    parser.add_argument("--endpoint", help="Override full endpoint URL")
    parser.add_argument("--limit", type=int, help="Limit output records")
    parser.add_argument("--sample", type=float, help="Sampling rate 0-1")
    parser.add_argument("--raw", action="store_true", help="Print raw response")
    args = parser.parse_args()

    account_id = read_env("CLOUDFLARE_ACCOUNT_ID")
    token = read_env("CLOUDFLARE_API_TOKEN")
    if not account_id or not token:
        print("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN", file=sys.stderr)
        return 1

    time_format = read_env("CLOUDFLARE_LOGPULL_TIME_FORMAT", "rfc3339") or "rfc3339"
    if args.since:
        end_time = dt.datetime.now(dt.timezone.utc)
        try:
            start_time = end_time - parse_duration(args.since)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
    else:
        if not args.start or not args.end:
            print("Provide --since or both --from/--to", file=sys.stderr)
            return 1
        try:
            start_time = parse_iso(args.start)
            end_time = parse_iso(args.end)
        except ValueError:
            print(
                "Invalid time format; use RFC3339 like 2026-01-27T12:00:00Z",
                file=sys.stderr,
            )
            return 1

    endpoint = (
        args.endpoint
        or read_env("CLOUDFLARE_LOGPULL_ENDPOINT")
        or f"{read_env('CLOUDFLARE_LOGPULL_BASE_URL', 'https://api.cloudflare.com/client/v4')}/accounts/{account_id}/logs/received"
    )

    params = {
        "start": format_time(start_time, time_format),
        "end": format_time(end_time, time_format),
    }

    dataset = args.dataset or read_env(
        "CLOUDFLARE_LOGPULL_DATASET", "workers_trace_events"
    )
    if dataset:
        params["dataset"] = dataset

    fields = args.fields or read_env("CLOUDFLARE_LOGPULL_FIELDS")
    if fields:
        params["fields"] = fields

    if args.sample is not None:
        params["sample"] = str(args.sample)

    url = f"{endpoint}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        print(f"Logpull error: {exc.code} {exc.reason}", file=sys.stderr)
        try:
            print(exc.read().decode("utf-8"), file=sys.stderr)
        except Exception:
            pass
        return 1
    except urllib.error.URLError as exc:
        print(f"Logpull request failed: {exc.reason}", file=sys.stderr)
        return 1

    if args.raw:
        print(payload)
        return 0

    records = parse_records(payload)
    if not records:
        print(payload.strip())
        return 0

    output_count = 0
    for record in records:
        if args.ray:
            value = get_value(record, ["RayID", "RayId", "ray_id"])
            if not value or args.ray not in value:
                continue
        if args.worker:
            value = get_value(
                record, ["ScriptName", "WorkerName", "worker", "script_name"]
            )
            if not value or args.worker not in value:
                continue
        if args.status:
            value = get_value(record, ["Status", "EdgeStatus", "status", "Outcome"])
            if not value or args.status not in value:
                continue
        if args.path:
            value = get_value(
                record, ["Path", "RequestPath", "RequestURL", "URL", "uri"]
            )
            if not value or args.path not in value:
                continue
        if args.contains:
            if args.contains not in json.dumps(record, ensure_ascii=True):
                continue

        print(json.dumps(record, ensure_ascii=True))
        output_count += 1
        if args.limit and output_count >= args.limit:
            break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
