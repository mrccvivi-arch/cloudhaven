"""Offline English to Chinese headline translation using the open Argos model."""
import os
from pathlib import Path
import re
from zipfile import ZipFile

HAN = re.compile(r"[\u3400-\u9fff]")
NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def checked_translation(original, translated):
    if not isinstance(translated, str):
        return None
    text = " ".join(translated.split())
    if len(HAN.findall(text)) < 4 or len(text) > max(90, len(original) * 2):
        return None
    if NUMBER.findall(original) != NUMBER.findall(text):
        return None
    if any(mark in text for mark in ("�", "<unk>", "[UNK]")):
        return None
    return text


def offline_translator():
    archive_path = os.environ.get("DAILY_WORLD_TRANSLATION_MODEL")
    if not archive_path:
        return None
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
