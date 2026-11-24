"""Refresh the static Daily World digest from publishers' Chinese feeds."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from http.client import HTTPException
from html import unescape
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

if __package__:
    from .news_translation import checked_translation, offline_translator
else:
    from news_translation import checked_translation, offline_translator

BEIJING = ZoneInfo("Asia/Shanghai")
CATEGORIES = ("国际时事", "财经", "科技", "科学", "太空探索")
WORLD, ECONOMY, TECH, SCIENCE, SPACE = CATEGORIES
EXCLUDED = re.compile(
    r"\b(?:rumou?rs?|unconfirmed|sponsored|advertorial|promo code|gossip|live blog|press briefing schedule)\b",
    re.IGNORECASE,
)
FEEDS = [
    ("UN News", "un.org", WORLD, "https://news.un.org/feed/subscribe/en/news/all/rss.xml"),
    ("UN Geneva", "ungeneva.org", WORLD, "https://www.ungeneva.org/news-media/press-items-list/rss.xml"),
    ("Federal Reserve", "federalreserve.gov", ECONOMY, "https://www.federalreserve.gov/feeds/press_all.xml"),
    ("WTO news", "wto.org", ECONOMY, "https://www.wto.org/library/rss/latest_news_e.xml"),
    ("NASA", "nasa.gov", SPACE, "https://www.nasa.gov/news-release/feed/"),
    ("NIST", "nist.gov", TECH, "https://www.nist.gov/news-events/news/rss.xml"),
]


def article_url(raw, domain):
    parts = urlsplit(raw.strip())
    host = parts.hostname or ""
    if parts.scheme not in ("http", "https") or not parts.path or parts.path == "/" or parts.username:
        return None
    if host != domain and not host.endswith("." + domain):
        return None
    query = [(key, value) for key, value in parse_qsl(parts.query) if not key.lower().startswith(("utm_", "fbclid", "gclid"))]
    return urlunsplit(("https", host, parts.path, urlencode(query), ""))


def published_time(value):
    if not value:
        return None
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
        except (TypeError, ValueError, IndexError, OverflowError):
            return None
    return date.astimezone(BEIJING) if date.tzinfo else None


def parse_feed(payload, feed, now):
    source, domain, category, _ = feed
    root = ET.fromstring(payload)
    for node in root.findall(".//{*}item") + root.findall(".//{*}entry"):
        try:
            title = " ".join(unescape(node.findtext("{*}title", "")).split())
            if not re.search(r"[A-Za-z]{3}", title) or re.search(r"[\u3400-\u9fff]", title) or EXCLUDED.search(title):
                continue
            link_text = node.findtext("{*}origLink") or node.findtext("{*}link", "")
            if not link_text:
                link_text = next((link.get("href", "") for link in node.findall("{*}link")
                                  if link.get("rel", "alternate") == "alternate"), "")
            link = article_url(link_text, domain)
            date = published_time(node.findtext("{*}pubDate") or node.findtext("{*}published") or
                                  node.findtext("{*}date") or node.findtext("{*}updated"))
            if not link or not date or not now - timedelta(days=5) <= date <= now + timedelta(minutes=5):
                continue
        except (ValueError, OverflowError):
            continue
        topic = category
        if category in (WORLD, SPACE, TECH) and re.search(
            r"\b(?:research|scientists?|study|climate|biodiversity|discovery)\b", title, re.IGNORECASE
        ):
            topic = SCIENCE
        yield {"titleEn": title, "category": topic, "source": source, "url": link,
               "publishedAt": date.isoformat(timespec="seconds")}


def fetch_feed(feed, now):
    try:
        request = Request(feed[3], headers={"User-Agent": "Cloudhaven Daily World RSS Reader/1.0"})
        with urlopen(request, timeout=12) as response:
            payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                raise ValueError("RSS exceeds size limit")
        items = list(parse_feed(payload, feed, now))
        print(f"{feed[3]}: {len(items)} eligible stories", flush=True)
        return items
    except (OSError, HTTPException, ValueError, ET.ParseError) as error:
        print(f"::warning::{feed[3]}: {error}", flush=True)
        return []


def fingerprint(title):
    return "".join(c for c in unicodedata.normalize("NFKC", title).lower() if c.isalnum())


def similar(a, b):
    if a == b:
        return True
    if min(len(a), len(b)) < 8:
        return False
    if a in b or b in a:
        return True
    left = {a[i:i + 2] for i in range(len(a) - 1)}
    right = {b[i:i + 2] for i in range(len(b) - 1)}
    return len(left & right) / len(left | right) >= .64


def curate(items):
    ranked = sorted(items, key=lambda item: item["publishedAt"], reverse=True)
    selected = []
    urls = set()
    titles = []
    source_counts = {}
    for category, source_limit in [*((category, 2) for category in CATEGORIES), (None, 2), (None, 3)]:
        for item in ranked:
            if category is not None and item["category"] != category:
                continue
            if source_counts.get(item["source"], 0) >= source_limit:
                continue
            title = fingerprint(item["titleEn"])
            if item["url"] in urls or any(similar(title, prior) for prior in titles):
                continue
            urls.add(item["url"])
            titles.append(title)
            source_counts[item["source"]] = source_counts.get(item["source"], 0) + 1
            selected.append(item)
            if len(selected) == 8:
                return selected
            if category is not None:
                break
    return selected


def refresh(output, translator=None):
    now = datetime.now(BEIJING)
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = executor.map(lambda feed: fetch_feed(feed, now), FEEDS)
        items = curate(item for result in results for item in result)
    if len(items) < 5:
        print(f"::warning::Only {len(items)} verified RSS entries; existing digest retained")
        return False
    if translator:
        for item in items:
            try:
                translated = checked_translation(item["titleEn"], translator(item["titleEn"]))
                if translated:
                    item["titleZh"] = translated
            except Exception as error:
                print(f"::warning::Headline translation skipped: {error}", flush=True)
    updated = datetime.now(BEIJING)
    document = {"date": updated.date().isoformat(), "updatedAt": updated.isoformat(timespec="seconds"), "items": items}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent, delete=False) as stream:
        temp = Path(stream.name)
        try:
            json.dump(document, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.close()
            os.replace(temp, output)
        finally:
            temp.unlink(missing_ok=True)
    print(f"Updated {output} with {len(items)} stories at {document['updatedAt']}")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("public/news.json"))
    parser.add_argument("--require-fresh", action="store_true", help="Fail if no new issue was written")
    args = parser.parse_args()
    success = refresh(args.output, offline_translator())
    if args.require_fresh and not success:
        raise SystemExit(1)
