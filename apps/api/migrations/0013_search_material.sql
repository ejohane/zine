-- Retain original structured metadata in R2 and index text-bearing fields directly.
DELETE FROM search_documents WHERE field='structuredData';
