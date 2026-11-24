from datetime import datetime
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from scripts import update_news as news


class UpdateNewsTests(unittest.TestCase):
    def test_rss_parser_keeps_publisher_links_and_beijing_dates(self):
        xml = """<rss xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0"><channel>
        <item><title>新衛星進入地球軌道</title><link>https://tracker.invalid/x</link>
        <feedburner:origLink>https://www.cna.com.tw/news/ait/202611240001.aspx?utm_source=rss</feedburner:origLink>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        <item><title>網傳優惠未經證實</title><link>https://www.cna.com.tw/news/ait/202611240002.aspx</link>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        <item><title>錯誤來源不採用</title><link>https://cna.com.tw.invalid/anything</link>
        <pubDate>Mon, 23 Nov 2026 23:10:00 GMT</pubDate></item>
        </channel></rss>""".encode()
        now = datetime(2026, 11, 24, 8, tzinfo=news.BEIJING)
        stories = list(news.parse_feed(xml, news.FEEDS[2], now))
        self.assertEqual(stories, [{
            "title": "新衛星進入地球軌道", "category": news.SCIENCE, "source": "中央社",
            "url": "https://www.cna.com.tw/news/ait/202611240001.aspx",
            "publishedAt": "2026-11-24T07:10:00+08:00",
        }])

    def test_curates_categories_and_preserves_last_digest_on_partial_failure(self):
        titles = ("國際組織召開氣候會議", "央行公布最新經濟展望", "研究團隊發表人工智慧模型",
                  "天文學家觀察到新的行星軌道並持續追蹤該天體的多項變化與特徵",
                  "博物館展出新一批館藏文物")
        entries = [
            {"title": title, "category": category, "source": "測試", "url": f"https://example.org/{index}",
             "publishedAt": "2026-11-24T07:10:00+08:00"}
            for index, (title, category) in enumerate(zip(titles, news.CATEGORIES))
        ]
        duplicate = {**entries[0], "title": titles[0] + "並公布報告", "url": "https://example.org/repeat"}
        self.assertEqual(len(news.curate([*entries, duplicate])), 5)

        with TemporaryDirectory() as directory:
            output = Path(directory) / "news.json"
            with patch.object(news, "fetch_feed", return_value=entries):
                self.assertTrue(news.refresh(output))
            original = output.read_bytes()
            digest = json.loads(original)
            self.assertTrue(digest["updatedAt"].endswith("+08:00"))
            self.assertEqual({item["category"] for item in digest["items"]}, set(news.CATEGORIES))
            self.assertTrue(all(len(item["title"]) <= 30 for item in digest["items"]))
            with patch.object(news, "fetch_feed", return_value=entries[:1]):
                self.assertFalse(news.refresh(output))
            self.assertEqual(output.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
