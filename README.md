# Codebase Whisperer

Codebase Whisperer is a production-ready, multi-tenant Retrieval-Augmented Generation (RAG) platform that helps developer teams interact with source code at scale. Users can link public or private GitHub repositories, browse a structured file tree, and chat with the codebase to find bugs, generate documentation, and learn legacy patterns.

🎥 Demo: [PLACEHOLDER — replace with your demo URL]

## Table of contents

- [Key Features](#key-features)
- [Architecture](#architecture)
- [Environment configuration](#environment-configuration)
- [Local installation](#local-installation)
- [Supabase vector schema (example)](#supabase-vector-schema-example)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Key Features

- Dynamic split-pane UI built with React for a fluid workspace experience.
- Hierarchical tree viewer for remote repository navigation (VS Code style).
- GitHub OAuth 2.0 multi-tenant auth with JWT session isolation.
- Fault-tolerant ingestion pipeline that skips heavy dependency folders (`node_modules`, `venv`, `__pycache__`).
- Strict RAG data isolation: stores vectors in Supabase (pgvector) with metadata-based filtering (`userId`, `repositoryId`).
- Persistent context and conversation history stored in MongoDB and/or Supabase as configured.

## Architecture

High level:

GitHub REST API → Backend (crawler, ingester, API) → Supabase (pgvector) + MongoDB (metadata, sessions) → Frontend (React) → User

## Environment configuration

Create a `.env` file in the backend root (see `codebase-whisperer-backend/.env.example`). Example variables:

```env
PORT=5000
MONGO_URI=mongodb+srv://your_username:your_password@cluster.mongodb.net/your_db
SUPABASE_URL=https://your_project_id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GROQ_API_KEY=gsk_your_private_groq_cloud_access_credential_string
HF_TOKEN=hf_your_huggingface_inference_api_token
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
JWT_SECRET=your_jwt_signing_key
GITHUB_DEV_OVERRIDE_TOKEN=your_personal_access_token_optional
```

## Local installation

1. Backend

```bash
cd codebase-whisperer-backend
npm install
node server.js
```

2. Frontend

```bash
cd codebase-whisperer-frontend
npm install
npm start
```

## Supabase vector schema (example)

Enable the `vector` extension in your Supabase Postgres database and create a documents table for embeddings:

```sql
create extension if not exists vector;

create table documents (
  id bigserial primary key,
  content text,
  metadata jsonb,
  embedding vector(384)
);

-- Example similarity query (replace :query_embedding and optional filter):
-- :query_embedding should be a vector(384) parameter provided by the application
select
  id,
  content,
  metadata,
  1 - (embedding <=> :query_embedding) as similarity
from documents
where metadata @> '{"userId": "YOUR_USER_ID"}'
order by embedding <=> :query_embedding
limit 10;
```

## Security

- Never commit secrets or `.env` files to git. Use `codebase-whisperer-backend/.env.example` as a template.
- Revoke or rotate tokens (GitHub, HF, Supabase) immediately if exposed.

## Contributing

Contributions are welcome. Please open issues or pull requests and include a clear description of the change. Add tests for new features where appropriate.

## License

This project does not include a license file. Add a `LICENSE` file (for example, MIT) if you want to permit open-source use.

---

If you want, I can also:

- add a short Troubleshooting section,
- include a one-line Quick Start at the top,
- or format the demo/video block when you provide the URL.
