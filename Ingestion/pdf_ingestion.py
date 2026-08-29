import logging
from langchain_community.document_loaders import PyPDFLoader

logger = logging.getLogger("ingestion.pdf")


def load_pdf_pages(pdf_path: str):
	logger.info("Loading PDF pages from %s", pdf_path)

	loader = PyPDFLoader(pdf_path)
	documents = loader.load()
	logger.info("Loaded %d pages from %s", len(documents), pdf_path)
	return documents

# execute this only is the script is run directly, not imported as a module
if __name__ == "__main__":
	import argparse

	parser = argparse.ArgumentParser(description="Load PDF and print page count")
	parser.add_argument(
		"pdf_path",
		nargs="?",
		default=r"C:\Users\diyam\projects\DiyRAG\ingestables\broadridge.pdf",
		help="Path to PDF file",
	)
	args = parser.parse_args()
	load_pdf_pages(args.pdf_path)