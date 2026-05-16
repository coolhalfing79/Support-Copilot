# Support-Copilot Development Guidelines

This document outlines the coding standards, architectural principles, and workflows for the Support-Copilot project. Our primary goal is to maintain a codebase that is **high quality, readable, and simple**.

---

## 1. Core Principles

*   **KISS (Keep It Simple, Stupid):** Prefer simple, straightforward implementations over complex, "clever" solutions.
*   **Readability Matters:** Code is read more often than it is written. Use descriptive names and clear structures.
*   **Explicit over Implicit:** Avoid "magic" and hidden logic. Be explicit about types, dependencies, and side effects.
*   **Safety First:** Protect credentials, handle errors gracefully, and validate all inputs.

---

## 2. Backend Standards (Python / FastAPI)

*   **Strong Typing:** Use Python type hints everywhere. Use `mypy` or `pyright` for static analysis.
*   **Pydantic v2:** Use Pydantic models for request/response validation. Prefer `BaseModel` and `ConfigDict(from_attributes=True)`.
*   **SQLAlchemy 2.0:** Use the modern `Mapped` and `mapped_column` syntax. Keep models in `backend/models` and separate them from API schemas in `backend/schemas`.
*   **FastAPI Dependencies:** Use dependency injection for database sessions, authentication, and service instances.
*   **Async/Await:** Use `async` for I/O bound tasks (API calls, DB queries). Ensure long-running CPU tasks are handled appropriately.
*   **Docstrings:** Use Google-style docstrings for non-trivial functions and classes.
*   **Formatting:** Follow PEP 8. Use `black` and `ruff` for consistent formatting and linting.

---

## 3. Frontend Standards (React / TypeScript)

*   **Functional Components:** Use functional components with hooks. Avoid class components.
*   **TypeScript:** Enforce strict typing. Avoid `any` at all costs. Use interfaces/types for component props and API responses.
*   **Tailwind CSS:** Use Tailwind for styling. Keep components small and focused on a single responsibility.
*   **State Management:** Use `zustand` for global state and React hooks for local state.
*   **Data Fetching:** Use `axios` for API calls, centralized in `frontend/src/config/api.ts` or similar.
*   **Project Structure:** Group components by feature or keep them in `src/components` if generic.

---

## 4. AI & RAG Patterns

*   **Prompt Management:** Keep prompts in `backend/ai/prompts.py`. Use templates and avoid hardcoding strings in logic.
*   **Vector DB:** Use ChromaDB for embeddings. Ensure consistent chunking strategies in `backend/utils/text_splitter.py`.
*   **Safety & Evaluation:** Always validate LLM outputs. Log confidence scores where available.
*   **Modular RAG:** Keep the retrieval logic separate from the generation logic to allow for independent optimization.

---

## 5. Testing Standards

*   **Test-Driven Development (Optional but Encouraged):** Write tests before or alongside code.
*   **Backend Testing:** Use `pytest` and `pytest-asyncio`. Maintain high coverage in `backend/tests`.
*   **Integration Tests:** Ensure end-to-end flows (e.g., ticket creation to JIRA escalation) are tested.
*   **Frontend Testing:** Use Vitest or similar for unit/component tests.

---

## 6. Workflow & Commits

*   **Surgical Changes:** Focus on one task at a time. Avoid unrelated refactoring.
*   **Meaningful Commits:** Use clear, concise commit messages (e.g., `feat: add JIRA integration`, `fix: handle empty search results`).
*   **Documentation:** Update this file or other `.md` files in `plan/` when introducing major architectural changes.
*   **Review:** All PRs should be reviewed for adherence to these standards.

---

## 7. Security

*   **Secrets:** Never commit `.env` files, API keys, or passwords. Use environment variables.
*   **Validation:** Sanitize all user inputs to prevent SQL injection and XSS.
*   **Auth:** Use the established JWT-based authentication in `backend/services/auth_service.py`.

---

> "Clean code always looks like it was written by someone who cares." — Michael Feathers
