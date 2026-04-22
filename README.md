# truelinks ai

a specialized retrieval-augmented generation (rag) platform designed for the fidic 1999 red book framework. this application enables professionals to query complex contract documents using semantic search and hybrid keyword retrieval.

## core architecture

the system follows a modern rag pipeline architecture to ensure high precision in legal document retrieval:

1.  **document processing**: pdfs are parsed using `unpdf`, maintaining coordinate-based layout awareness to preserve paragraph structure.
2.  **semantic chunking**: text is segmented by legal clauses and sub-clauses. it uses an overlap strategy to maintain context across boundaries.
3.  **embedding & indexing**: segments are converted into 384-dimensional vectors using the `jina-embeddings-v2-small-en` model and cached in a local json vector store.
4.  **hybrid retrieval**: uses a weighted combination of vector similarity (cosine) and keyword relevance (idf with porter stemming).
5.  **contextual generation**: retrieved chunks are injected into a prompt for `gemini-2.5-flash`, which generates responses with strict inline legal citations.

## tech stack

* **framework**: next.js 15 (app router)
* **language**: typescript
* **runtime environment**: Node.js 18+
* **ai models**: google gemini (llm), xenova/jina-v2 (embeddings)
* **styling**: tailwind css 4, framer motion
* **processing**: unpdf, natural language processing (nlp)

## getting started

### prerequisites

* node.js 18.x or higher
* google gemini api key

### installation

1.  clone the repository:
    ```bash
    git clone [https://github.com/oodyb/true-links-ai.git]
    cd truelinks-ai
    ```

2.  install dependencies:
    ```bash
    npm install
    ```

3.  configure environment variables:
    create a `.env.local` file in the root directory:
    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

### building the vector index

before running the chat, you must process the fidic pdf into the vector store. ensure your source file `cons1_bc.pdf` is inside `public/data/`, then run:

```bash
npm run build:chunks
```

this script extracts the text, generates embeddings, and creates public/data/chunks.json

### development

run the development server:

```bash
npm run dev
```

open http://localhost:3000

### project structure

* `src/lib/` - core logic including pdf loading, chunking, embeddings, and retrieval.
* `src/app/api/chat/` - the primary chat endpoint handling llm orchestration.
* `src/components/chat/` - modular ui components for the conversation interface.
* `scripts/` - utility scripts for document indexing and data preparation.

### unique features

* **Page-Aware Context**: the system utilizes an internal marker system to accurately map every paragraph back to its original page.
* **citation engine**: automatically maps assistant mentions to document source material with page numbers.
* **hybrid search**: semantic similarity (cosine) with BM25-style keyword relevance. heuristic layer; bumps scores based on clauses and penalizes noise.
* **layout reconstruction**: custom parser that interprets PDF transform matrices (X/Y coordinates). ensures text is constructed with structural integrity.
* **Context Window Optimization**: a sliding conversation history with a character budget to maintain high performance without exceeding LLM token limits.
* **Enforced JSON Citations**: a custom validation layer to map LLM responses back to verified document chunks, ensuring every claim is fact-checked.
* **typewriter stream**: simulates natural human-like response generation for better user experience.

### license

this project is intended for internal use and professional legal reference. ensure you have the necessary licenses for the fidic documents used within the system.