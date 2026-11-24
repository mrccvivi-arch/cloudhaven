from datetime import datetime
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts import update_news as news
from scripts.news_translation import checked_translation, preserves_topic


class UpdateNewsTests(unittest.TestCase):
    def test_rss_and_atom_use_english_and_validate_publisher_links(self):
        xml = """<rss><channel>
        <item><title>NASA Announces Mission Update</title>
        <link>https://www.nasa.gov/missions/test/?utm_source=rss</link>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        <item><title>Unconfirmed rumor about launch</title><link>https://www.nasa.gov/rumor</link>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        <item><title>Unrelated publisher headline</title><link>https://nasa.gov.invalid/article</link>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        <item><title>中文标题</title><link>https://www.nasa.gov/old-cn</link>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        </channel></rss>""".encode()
        now = datetime(2026, 11, 24, 8, tzinfo=news.BEIJING)
        feed = next(source for source in news.FEEDS if source[0] == "NASA")
        stories = list(news.parse_feed(xml, feed, now))
        self.assertEqual(stories, [{
            "titleEn": "NASA Announces Mission Update", "category": news.SPACE, "source": "NASA",
            "url": "https://www.nasa.gov/missions/test/", "publishedAt": "2026-11-24T07:10:00+08:00",
        }])
        atom = """<feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <title>Spacecraft Enters Orbit</title>
        <link rel="alternate" href="https://www.nasa.gov/mission/"/>
        <published>2026-11-23T23:10:00Z</published></entry></feed>""".encode()
        self.assertEqual(list(news.parse_feed(atom, feed, now))[0]["titleEn"], "Spacecraft Enters Orbit")

    def test_refresh_uses_english_fallback_and_retains_snapshot_on_failure(self):
        titles = ("Nations convene in Geneva", "Central bank issues economic projections",
                  "Scientists track ocean temperatures", "Spacecraft enters orbit after 2 years",
                  "New computing standard published")
        entries = [
            {"titleEn": title, "category": category, "source": f"Example {index}", "url": f"https://example.org/{index}",
             "publishedAt": f"2026-11-24T07:{15-index:02d}:00+08:00"}
            for index, (title, category) in enumerate(zip(titles, (news.WORLD, news.ECONOMY, news.SCIENCE, news.SPACE, news.TECH)))
        ]
        duplicate = {**entries[0], "titleEn": titles[0] + " this week", "url": "https://example.org/repeat"}
        routine = {**entries[0], "titleEn": "Federal Reserve announces contest winners", "url": "https://example.org/administration"}
        curated = news.curate([*entries, duplicate, routine])
        self.assertEqual(len(curated), 4)
        self.assertNotIn(routine, curated)
        self.assertEqual(len({item["category"] for item in curated}), 4)
        self.assertIsNone(checked_translation(titles[3], "航天器在三年后进入轨道"))
        self.assertEqual(checked_translation(titles[3], "航天器在2年后进入轨道"), "航天器在2年后进入轨道")
        self.assertTrue(preserves_topic(titles[3], "The spacecraft enters orbit after 2 years"))
        self.assertFalse(preserves_topic(titles[3], "Astronauts leave the station next year"))
        self.assertIsNone(checked_translation("NASA and NOAA announce a mission", "美国航天局和诺阿宣布任务"))

        with TemporaryDirectory() as directory:
            output = Path(directory) / "news.json"
            with patch.object(news, "fetch_feed", return_value=entries):
                self.assertTrue(news.refresh(output, lambda title: "测试中文标题"))
            original = output.read_bytes()
            digest = json.loads(original)
            self.assertTrue(digest["updatedAt"].endswith("+08:00"))
            self.assertEqual({item["category"] for item in digest["items"]}, {news.WORLD, news.ECONOMY, news.SCIENCE, news.SPACE})
            self.assertEqual(digest["items"][0]["titleZh"], "测试中文标题")
            self.assertNotIn("titleZh", digest["items"][-1])
            with patch.object(news, "fetch_feed", return_value=entries[:1]):
                self.assertFalse(news.refresh(output))
            self.assertEqual(output.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
