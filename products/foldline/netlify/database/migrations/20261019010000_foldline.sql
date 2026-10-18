CREATE TABLE foldline_workspaces (
 id text PRIMARY KEY, owner_id text NOT NULL, name text NOT NULL, slug text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foldline_workspace_owner ON foldline_workspaces(owner_id);
CREATE TABLE foldline_requests (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES foldline_workspaces(id) ON DELETE CASCADE,
 title text NOT NULL, problem text NOT NULL DEFAULT '', workaround text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'inbox' CHECK(status IN ('inbox','planned','declined','shipped','merged')),
 decision text NOT NULL DEFAULT '', reason text NOT NULL DEFAULT '', public_submission boolean NOT NULL DEFAULT false,
 merged_into text REFERENCES foldline_requests(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX foldline_request_workspace ON foldline_requests(workspace_id);
CREATE TABLE foldline_decisions (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES foldline_workspaces(id) ON DELETE CASCADE,
 request_id text NOT NULL REFERENCES foldline_requests(id) ON DELETE CASCADE,
 decision text NOT NULL, reason text NOT NULL, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE foldline_releases (
 id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES foldline_workspaces(id) ON DELETE CASCADE,
 title text NOT NULL, body text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE foldline_release_requests (
 release_id text NOT NULL REFERENCES foldline_releases(id) ON DELETE CASCADE,
 request_id text NOT NULL REFERENCES foldline_requests(id) ON DELETE CASCADE,
 PRIMARY KEY(release_id,request_id)
);
CREATE TABLE foldline_orders (
 -- Billing records outlive a deleted board: the pass belongs to its owner.
 -- Keep the original workspace id to reconcile later refund/capture events.
 id text PRIMARY KEY, workspace_id text NOT NULL,
 owner_id text NOT NULL, amount integer NOT NULL CHECK(amount=49900), currency text NOT NULL CHECK(currency='INR'),
 payment_id text UNIQUE, paid_until timestamptz, revoked boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE foldline_webhook_events (
 id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE foldline_intake_limits (
 workspace_id text NOT NULL REFERENCES foldline_workspaces(id) ON DELETE CASCADE,
 fingerprint text NOT NULL, bucket timestamptz NOT NULL, count integer NOT NULL,
 PRIMARY KEY(workspace_id,fingerprint,bucket)
);
