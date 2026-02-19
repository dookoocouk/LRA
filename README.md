# RealFood? — AI-Powered UK Food Label Transparency

An AI-powered food transparency app for UK consumers. Uses LLM-based reasoning
to decode complex food labels, identify ultra-processed food (UPF) markers, and
surface "stealth" ingredients that traditional barcode databases miss.

## Project Structure

```
├── config/
│   └── scoring_config.yaml       # Scoring engine weights and thresholds
├── docs/
│   ├── 01_ai_mvp_scope.md        # AI MVP scope and intelligence baseline
│   ├── 02_scoring_engine.md       # Deterministic traffic-light scoring rubric
│   ├── 03_graph_data_schema.md    # Graph schema with vector embeddings
│   ├── 04_safety_layer.md         # Guardrails, system prompt, compliance
│   ├── 05_edge_cases.md           # 20 AI edge cases (hallucinations + label tricks)
│   └── 06_red_team_test_suite.md  # 10 jailbreak prompts + 10 dirty label tests
└── src/
    └── scoring/
        └── engine.py              # Scoring engine implementation
```

## Deliverables

| # | Deliverable | Document |
|---|---|---|
| 1 | AI MVP Scope | `docs/01_ai_mvp_scope.md` |
| 2 | Scoring Engine | `docs/02_scoring_engine.md` |
| 3 | Graph Data Schema | `docs/03_graph_data_schema.md` |
| 4 | Safety Layer (Guardrails) | `docs/04_safety_layer.md` |
| 5 | 20 AI Edge Cases | `docs/05_edge_cases.md` |
| 6 | Red-Team Test Suite | `docs/06_red_team_test_suite.md` |

## Key Design Decisions

- **UK-centric**: FSA thresholds, UK FIR 2014 allergen rules, UK English throughout.
- **Deterministic scoring**: LLM classifies ingredients; arithmetic is fixed.
- **Defence in depth**: Input sanitisation → system prompt constraints → output validation.
- **Vector embeddings**: Fuzzy-match misspelled/variant ingredient names via ANN search.
- **Zero medical claims**: Hard-blocked at system prompt and output filter levels.

## Tech Stack (MVP)

- **OCR**: Google Cloud Vision API
- **LLM**: Claude API (Anthropic)
- **Graph DB**: Neo4j or PostgreSQL + Apache AGE
- **Embeddings**: voyage-3-lite (384 dimensions) with pgvector
- **Backend**: Python 3.12 + FastAPI
- **Client**: React Native (Expo)
