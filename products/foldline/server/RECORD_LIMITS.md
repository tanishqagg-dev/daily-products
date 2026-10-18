# Stored record limits

Each Free workspace can store 25 releases, 200 decision-history entries, and
250,000 bytes of stored UTF-8 text. Each workspace covered by an active Plus pass
can store 100 releases, 1,000 decision-history entries, and 1,000,000 bytes of
stored UTF-8 text. These limits supplement the 30/500 request limits. All limits
apply together, so large notes can exhaust text capacity before the row counts.

A changed request creates one history entry. Publishing a release creates one
history entry per linked request. Saving an unchanged request creates none.
Capacity checks run while holding the workspace's transaction lock, before any
request, release or history changes are written. A release must fit its entire
linked request history in the remaining capacity.

The text budget counts all text columns in requests, decision history and
releases, including identifiers. Request updates count the change in current
text plus their new history entry. Releases count their own text, request status
changes and every new history entry. Tiny bounded merge references can still be
added so an owner can organize existing evidence at capacity. Payment records
are separate and contain no feedback text.

The workspace API returns only the newest 50 decision-history entries. Current
request decisions and reasons remain part of each request. All history stays in
the database until workspace deletion; the CSV export includes current request
fields and source/release links, rather than the full historical audit trail.

Reaching a limit does not remove records. Review, public board reads, export and
workspace deletion remain available. If a Plus pass expires, existing records
remain; new records must fit the Free limits until another pass is active.
