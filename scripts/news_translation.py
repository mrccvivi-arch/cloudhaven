"""Offline English to Chinese headline translation using the open Argos model."""
import os
from pathlib import Path
import re
from zipfile import ZipFile

HAN = re.compile(r"[\u3400-\u9fff]")
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
WORD = re.compile(r"[a-z]+\d*|\d+")
STOP_WORDS = set("a an the it its in on at to for of by from as and or into with is are has have this that".split())
ORGANIZATIONS = {
    "NASA": ("美国航天局", "美国宇航局", "美国国家航空航天局"),
    "NOAA": ("美国国家海洋和大气管理局", "美国国家海洋与大气管理局"),
    "NIST": ("美国国家标准与技术研究院", "美国国家标准和技术研究院"),
}


def checked_translation(original, translated):
    if not isinstance(translated, str):
        return None
    text = " ".join(translated.replace("▁", " ").split())
    if len(HAN.findall(text)) < 4 or len(text) > max(90, len(original) * 2):
        return None
    if NUMBER.findall(original) != NUMBER.findall(text):
        return None
    if any(mark in text for mark in ("�", "<unk>", "[UNK]")):
        return None
    for acronym, names in ORGANIZATIONS.items():
        if re.search(rf"\b{acronym}\b", original) and not any(name in text for name in (acronym, *names)):
            return None
    return text


def preserves_topic(original, roundtrip):
    def keywords(title):
        return {word.rstrip("s") for word in WORD.findall(title.lower()) if word not in STOP_WORDS}

    before = keywords(original)
    after = keywords(roundtrip)
    return bool(before and after) and len(before & after) / max(len(before), len(after)) >= .65


def offline_translator():
    forward_path = os.environ.get("DAILY_WORLD_TRANSLATION_MODEL")
    reverse_path = os.environ.get("DAILY_WORLD_REVERSE_MODEL")
    if not forward_path or not reverse_path:
        return None
    forward = load_model(forward_path)
    reverse = load_model(reverse_path)
    if not forward or not reverse:
        return None

    def translate(original):
        text = checked_translation(original, forward(original))
        return text if text and preserves_topic(original, reverse(text)) else None

    return translate


def load_model(archive_path):
    try:
        import ctranslate2
        import sentencepiece
        from tempfile import TemporaryDirectory

        with TemporaryDirectory() as directory, ZipFile(archive_path) as archive:
            root = next(name.rsplit("/", 1)[0] for name in archive.namelist() if name.endswith("/sentencepiece.model"))
            prefix = root + "/model/"
            # Only copy files expected by the model runtime, within a private directory.
            model = Path(directory)
            for name in archive.namelist():
                filename = name.removeprefix(prefix)
                if name.startswith(prefix) and filename and "/" not in filename:
                    (model / filename).write_bytes(archive.read(name))
            tokens = sentencepiece.SentencePieceProcessor(model_proto=archive.read(root + "/sentencepiece.model"))
            engine = ctranslate2.Translator(str(model), device="cpu", inter_threads=1, intra_threads=2)
    except Exception as error:
        print(f"::warning::Offline headline translation unavailable: {error}", flush=True)
        return None

    def translate(original):
        source = tokens.encode(original, out_type=str)
        result = engine.translate_batch([source], beam_size=4, max_decoding_length=110)[0]
        return tokens.decode(result.hypotheses[0])

    return translate
