import re
from typing import List
import logging

logger = logging.getLogger("preprocessing")


def segment_sentences(text: str) -> List[str]:
    """Split a text document into a list of sentence-like segments."""
    if not text or not str(text).strip():
        return []

    normalized_text = re.sub(r"\s+", " ", str(text).strip())
    sentence_end_regex = re.compile(r"(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?|!)\s")
    sentences = sentence_end_regex.split(normalized_text)

    sents = [sentence.strip() for sentence in sentences if sentence.strip()]
    logger.debug("Segmented text into %d sentence-like segments", len(sents))
    return sents
