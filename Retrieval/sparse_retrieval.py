import re
import logging
from typing import List, Callable, Optional, Tuple, Any
import math
import numpy as np


def _default_tokenize(text: str, stemmer: Optional[Callable[[str], str]] = None, stopwords: Optional[set] = None) -> List[str]:
	token_pattern = re.compile(r"[a-zA-Z0-9']+")
	tokens = [t.lower() for t in token_pattern.findall(text)]

	if stopwords:
		tokens = [t for t in tokens if t not in stopwords]

	if stemmer:
		try:
			tokens = [stemmer(t) for t in tokens]
		except Exception:
			pass

	return tokens


class SimpleBM25:
	"""Lightweight BM25 implementation to avoid external dependencies.

	Usage:
	  bm = SimpleBM25()
	  bm.index(tokenized_docs)
	  scores = bm.get_scores(tokenized_query)
	"""

	def __init__(self, k1: float = 1.5, b: float = 0.75):
		self.k1 = k1
		self.b = b
		self.doc_freq = {}
		self.tokenized_docs = []
		self.doc_len = []
		self.N = 0
		self.avgdl = 0.0

	def index(self, tokenized_docs: List[List[str]]):
		import logging
		logger = logging.getLogger("retrieval.bm25")

		self.tokenized_docs = tokenized_docs
		self.N = len(tokenized_docs)
		self.doc_len = [len(d) for d in tokenized_docs]
		self.avgdl = float(sum(self.doc_len)) / max(1, self.N)

		df = {}
		for doc in tokenized_docs:
			seen = set()
			for token in doc:
				if token not in seen:
					df[token] = df.get(token, 0) + 1
					seen.add(token)

		self.doc_freq = df
		logger.info("Indexed %d documents (avgdl=%.2f)", self.N, self.avgdl)

	def get_scores(self, query_tokens: List[str]) -> np.ndarray:
		import logging
		logger = logging.getLogger("retrieval.bm25")
		scores = np.zeros(self.N, dtype=float)
		for q in query_tokens:
			df = self.doc_freq.get(q, 0)
			if df == 0:
				continue
			idf = math.log(1 + (self.N - df + 0.5) / (df + 0.5))

			for idx, doc in enumerate(self.tokenized_docs):
				f = doc.count(q)
				denom = f + self.k1 * (1 - self.b + self.b * (self.doc_len[idx] / self.avgdl))
				score = (idf * f * (self.k1 + 1)) / denom if denom > 0 else 0.0
				scores[idx] += score

		return scores


class SparseRetriever:
	"""Sparse retriever supporting selectable chunking and embedding hooks.

	Parameters:
	  stopwords: either 'en' or a set of stopwords to remove during tokenization.
	  stemmer: a callable that accepts a token and returns its stem. If None, stemming is skipped.
	"""

	_EN_STOPWORDS = {
		"the",
		"and",
		"is",
		"in",
		"to",
		"of",
		"a",
		"for",
		"on",
		"with",
		"that",
		"as",
		"are",
		"it",
		"this",
		"by",
	}

	def __init__(self, stopwords: Optional[Any] = "en", stemmer: Optional[Callable[[str], str]] = None):
		if stopwords == "en":
			self.stopwords = self._EN_STOPWORDS
		elif isinstance(stopwords, set):
			self.stopwords = stopwords
		else:
			self.stopwords = None

		self.stemmer = stemmer

		self._bm25 = SimpleBM25()
		self._raw_docs = []
		self.logger = logging.getLogger("retrieval.sparse")

	def _ensure_text(self, item: Any) -> str:
		# Accept strings or objects with `page_content` or `content` attributes
		if isinstance(item, str):
			return item
		if hasattr(item, "page_content"):
			return getattr(item, "page_content") or ""
		if hasattr(item, "content"):
			return getattr(item, "content") or ""
		return str(item)

	def index(self, docs: List[Any], chunking_fn: Optional[Callable] = None, embedding_fn: Optional[Callable] = None):
		"""Index documents or pre-chunked items.

		Parameters:
		  docs: list of strings or objects. If `chunking_fn` is provided it will be called with `docs`.
		  chunking_fn: optional callable that returns a list of chunk objects or strings.
		  embedding_fn: unused for BM25 but accepted for API compatibility.
		"""
		# Allow user-supplied chunker to produce the actual text chunks
		if chunking_fn:
			items = chunking_fn(docs)
		else:
			items = docs

		texts = [self._ensure_text(i) for i in items]
		self._raw_docs = texts

		tokenized = [
			_default_tokenize(t, stemmer=self.stemmer, stopwords=self.stopwords) for t in texts
		]

		self._bm25.index(tokenized)
		self.logger.info("Sparse retriever indexed %d items", len(self._raw_docs))

	def retrieve(self, query: str, k: int = 5) -> Tuple[np.ndarray, np.ndarray]:
		"""Retrieve top-k documents for a free-text query.

		Returns:
		  results: numpy array shaped (1, k) of document texts
		  scores: numpy array shaped (1, k) of corresponding scores
		"""
		query_tokens = _default_tokenize(query, stemmer=self.stemmer, stopwords=self.stopwords)
		scores = self._bm25.get_scores(query_tokens)

		if len(scores) == 0:
			return np.empty((1, 0), dtype=object), np.empty((1, 0), dtype=float)

		top_idx = np.argsort(-scores)[:k]
		top_scores = scores[top_idx]
		top_docs = [self._raw_docs[i] for i in top_idx]

		results = np.array([top_docs], dtype=object)
		scores_arr = np.array([top_scores], dtype=float)

		return results, scores_arr


if __name__ == "__main__":
	# Demo using the user's example corpus and showing chunker/embedding compatibility.
	corpus = [
		"Data engineering relies heavily on robust ETL pipelines.",
		"Astronomy studies planets, stars, and celestial galaxies.",
		"Deep learning models require powerful GPUs and massive compute.",
		"Python is popular for data analysis and machine learning tasks.",
	]

	# Simple identity stemmer
	stemmer = lambda s: s

	retriever = SparseRetriever(stopwords="en", stemmer=stemmer)
	retriever.index(corpus)

	query = "Tell me about space, stars, and planets"
	results, scores = retriever.retrieve(query, k=2)

	for rank in range(results.shape[1]):
		print(f"Rank {rank + 1} (Score: {scores[0, rank]:.4f}): {results[0, rank]}")

