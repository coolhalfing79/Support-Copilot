# SemicoLabs Deployment Notes

SemicoLabs deploys frontend and backend as separate applications. Do not deploy
this monorepo root directly.

## Backend App

- Create a backend GitLab repository using the contents of `backend/` as the
  repository root.
- The backend repo root must contain `Dockerfile`.
- The backend container exposes and serves on port `8000`.
- Register this repository as the API/backend app in SemicoLabs.

## Frontend App

- Create a frontend GitLab repository using the contents of `frontend/` as the
  repository root.
- The frontend repo root must contain `Dockerfile`.
- The frontend container exposes and serves on port `8000`.
- Register this repository as the frontend app in SemicoLabs.

## Frontend Runtime Config

Set these variables for the frontend deployment to point at the deployed backend:

```env
API_BASE_URL=https://<backend-app-url>/api/v1
WS_BASE_URL=wss://<backend-app-url>/api/v1/chat/ws
```

For local development, the frontend still falls back to:

```env
API_BASE_URL=http://localhost:8000/api/v1
WS_BASE_URL=ws://localhost:8000/api/v1/chat/ws
```

## Important Constraints

- SemicoLabs builds with `docker build .` from each app repository root.
- Docker Compose is for local development only and is not used by SemicoLabs.
- Each deployed app must expose port `8000`.
