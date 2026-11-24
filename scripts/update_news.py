"""Refresh the static Daily World digest from publishers' Chinese feeds."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from http.client import HTTPException
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

BEIJING = ZoneInfo("Asia/Shanghai")
CATEGORIES = ("国际新闻", "财经与经济", "科技与人工智能", "科学与自然", "文化与社会")
INTERNATIONAL, ECONOMY, TECH, SCIENCE, CULTURE = CATEGORIES
SCIENCE_WORDS = re.compile(r"氣候|气候|天文|太空|軌道|轨道|衛星|卫星|生態|生态|物種|物种|基因|生物|保育|保護區|保护区|海洋|科學|科学")
EXCLUDED = re.compile(
    r"業配|广[告吿]|廣[告吿]|促銷|促销|限時優惠|限时优惠|八卦|緋聞|绯闻|爆料|傳聞|传闻|網傳|网传|未經證實|未经证实|"
    r"抽獎|抽奖|名人私生活|婚外情|私密照|獨家優惠|独家优惠"
)
CNA = "https://feeds.feedburner.com/rsscna/"
RTHK = "https://rthk.hk/rthk/news/rss/c_expressnews_"
HKGOV = "https://www.news.gov.hk/tc/"
FEEDS = [
    ("中央社", "cna.com.tw", INTERNATIONAL, CNA + "intworld"),
    ("中央社", "cna.com.tw", ECONOMY, CNA + "finance"),
    ("中央社", "cna.com.tw", TECH, CNA + "technology"),
    ("中央社", "cna.com.tw", CULTURE, CNA + "culture"),
    ("香港电台", "rthk.hk", INTERNATIONAL, RTHK + "cinternational.xml"),
    ("香港电台", "rthk.hk", ECONOMY, RTHK + "cfinance.xml"),
    ("香港电台", "rthk.hk", CULTURE, RTHK + "clocal.xml"),
    ("香港政府新闻网", "news.gov.hk", SCIENCE, HKGOV + "categories/environment/html/articlelist.rss.xml"),
    ("香港政府新闻网", "news.gov.hk", CULTURE, HKGOV + "city_life/html/articlelist.rss.xml"),
    ("联合国新闻", "news.un.org", INTERNATIONAL, "https://news.un.org/feed/subscribe/zh/news/all/rss.xml"),
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
    for node in ET.fromstring(payload).findall(".//item"):
        try:
            title = re.sub(r"\s+", " ", unicodedata.normalize("NFC", node.findtext("title", ""))).strip()
            if not re.search(r"[\u3400-\u9fff]", title) or EXCLUDED.search(title):
                continue
            link = article_url(node.findtext("{*}origLink") or node.findtext("link", ""), domain)
            date = published_time(node.findtext("pubDate") or node.findtext("{*}date"))
            if not link or not date or not now - timedelta(days=3) <= date <= now + timedelta(minutes=5):
                continue
        except (ValueError, OverflowError):
            continue
        assigned = SCIENCE if category in (TECH, INTERNATIONAL) and SCIENCE_WORDS.search(title) else category
        yield {"title": title, "category": assigned, "source": source, "url": link, "publishedAt": date.isoformat(timespec="seconds")}


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
    # Prefer compact headlines within each news day and reserve a place per topic when possible.
    ranked = sorted(items, key=lambda item: (
        item["publishedAt"][:10], len(item["title"]) <= 30, item["publishedAt"]
    ), reverse=True)
    selected = []
    urls = set()
    titles = []
    for category in (*CATEGORIES, None):
        for item in ranked:
            if category is not None and item["category"] != category:
                continue
            title = fingerprint(item["title"][:29] if len(item["title"]) > 30 else item["title"])
            if item["url"] in urls or any(similar(title, prior) for prior in titles):
                continue
            urls.add(item["url"])
            titles.append(title)
            original = item["title"]
            display = original if len(original) <= 30 else original[:29].rstrip(" ，、：；") + "…"
            selected.append({**item, "title": display})
            if len(selected) == 8:
                return selected
            if category is not None:
                break
    return selected


def refresh(output):
    now = datetime.now(BEIJING)
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = executor.map(lambda feed: fetch_feed(feed, now), FEEDS)
        items = curate(item for result in results for item in result)
    if len(items) < 5:
        print(f"::warning::Only {len(items)} verified RSS entries; existing digest retained")
        return False
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
    args = parser.parse_args()
    refresh(args.output)
