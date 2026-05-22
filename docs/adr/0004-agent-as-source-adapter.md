# Agent fetches per Source, not across Sources

The AI agent adapter calls one Source at a time (one `(source, key point, date range)` tuple per invocation) and returns a `ForecastPayload[]`, mirroring the existing Open-Meteo adapter contract. The agent does not span multiple sources or aggregate results internally.

## Considered Options

An aggregator shape was considered: one agent call fetches from whatever sources it finds for a location and returns a blended result. This is simpler to invoke but would bypass the Source weight model (geographic match × domain specialty × reliability), which is the foundation of the Confidence Range and Verdict computation. If the agent blends internally, the spread across sources is lost and the Confidence Range cannot be shown.

## Consequences

Agent-based Sources must carry fetch instructions (URL + navigation notes) so each per-Source call is deterministic. Discovery (finding new Sources via web exploration) is a separate, user-triggered flow — not part of the forecast refresh pipeline.
